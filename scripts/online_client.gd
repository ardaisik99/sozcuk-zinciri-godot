class_name ZincirOnlineClient
extends Node

signal changed
signal error_occurred(reason: String)
signal connection_changed(status: String)
signal room_changed(snapshot: Dictionary)
signal social_refreshed(success: bool)

const DEFAULT_CONFIG = "res://config/online.json"
static var config_override_for_tests = ""
var account_path = "user://online_account.json"
var base_url = ""
var profile: Dictionary = {}
var friends: Array = []
var incoming: Array = []
var outgoing: Array = []
var invites: Array = []
var room_code = ""
var room_state: Dictionary = {}
var room_snapshot_ready = false
var status = "idle"
var last_error = ""
var configured = false
var server_offset_ms = 0
var _token = ""
var _socket: WebSocketPeer
var _socket_kind = ""
var _closed_handled = false
var _reconnect_at = 0
var _reconnect_deadline = 0
var _reconnect_attempt = 0
var _requests: Array[HTTPRequest] = []
var _refreshing_social = false
var _active = true
var _finished_profile_room = ""

func _ready() -> void:
	set_process(false)

func start(player_name: String, config_path: String = DEFAULT_CONFIG) -> bool:
	if OS.is_debug_build() and not config_override_for_tests.is_empty(): config_path = config_override_for_tests
	load_account()
	var config: Dictionary = {}
	if config_path.begins_with("https://") or config_path.begins_with("http://127.0.0.1") or config_path.begins_with("http://localhost"):
		config = await _request_url(config_path, HTTPClient.METHOD_GET, {}, false)
	elif FileAccess.file_exists(config_path):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(config_path))
		if parsed is Dictionary: config = parsed
	base_url = str(config.get("baseUrl", "")).strip_edges().trim_suffix("/")
	configured = valid_base_url(base_url)
	if not configured:
		_fail("not_configured")
		return false
	status = "connecting"
	changed.emit()
	if not _token.is_empty():
		var me: Dictionary = await _request("/v1/me", HTTPClient.METHOD_GET)
		if me.get("ok", false) and me.get("profile") is Dictionary:
			profile = me.profile.duplicate(true)
			if me.has("activeRoom"):
				room_code = str(me.activeRoom).to_upper().substr(0, 6) if me.activeRoom is String else ""
			save_account()
		elif int(me.get("http_status", 0)) == 401 or me.get("reason", "") == "unauthorized":
			_token = ""
			profile.clear()
			room_code = ""
		else:
			_fail(str(me.get("reason", "network")))
			return false
	if _token.is_empty():
		var registration: Dictionary = await _request("/v1/register", HTTPClient.METHOD_POST, {"name": player_name}, false)
		if not registration.get("ok", false) or not registration.get("profile") is Dictionary or str(registration.get("token", "")).is_empty():
			_fail(str(registration.get("reason", "network")))
			return false
		profile = registration.profile.duplicate(true)
		_token = str(registration.token)
		save_account()
	await refresh_friends()
	if not _active: return false
	if room_code.is_empty(): connect_lobby()
	else: connect_room(room_code)
	changed.emit()
	return true

static func valid_base_url(value: String) -> bool:
	if value.is_empty(): return false
	if value.begins_with("https://"):
		return not value.trim_prefix("https://").is_empty() and not value.contains(" ")
	return value.begins_with("http://127.0.0.1:") or value.begins_with("http://localhost:")

func load_account() -> void:
	if not FileAccess.file_exists(account_path): return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(account_path))
	if not parsed is Dictionary or int(parsed.get("version", 0)) != 1: return
	var saved_token = parsed.get("token", "")
	var saved_profile = parsed.get("profile", {})
	if not saved_token is String or saved_token.length() < 16 or saved_token.length() > 512 or not saved_profile is Dictionary: return
	_token = saved_token
	profile = saved_profile.duplicate(true)
	room_code = str(parsed.get("roomCode", "")).substr(0, 6).to_upper()

func save_account() -> bool:
	var saved_room = "" if room_state.get("phase", "") == "finished" else room_code
	var file = FileAccess.open(account_path + ".tmp", FileAccess.WRITE)
	if file == null: return false
	file.store_string(JSON.stringify({"version": 1, "token": _token, "profile": profile, "roomCode": saved_room}))
	file.close()
	return DirAccess.rename_absolute(ProjectSettings.globalize_path(account_path + ".tmp"), ProjectSettings.globalize_path(account_path)) == OK

func refresh_friends() -> bool:
	if _refreshing_social:
		var finished: bool = await social_refreshed
		return finished
	_refreshing_social = true
	var result: Dictionary = await _request("/v1/friends", HTTPClient.METHOD_GET)
	_refreshing_social = false
	if not result.get("ok", false):
		_fail(str(result.get("reason", "network")))
		social_refreshed.emit(false)
		return false
	for key in ["friends", "incoming", "outgoing", "invites"]:
		set(key, result.get(key, []).duplicate(true) if result.get(key, []) is Array else [])
	changed.emit()
	social_refreshed.emit(true)
	return true

func rename_profile(player_name: String) -> bool:
	var result: Dictionary = await _request("/v1/profile", HTTPClient.METHOD_POST, {"name": player_name})
	if not result.get("ok", false): return _fail(str(result.get("reason", "network")))
	if result.get("profile") is Dictionary: profile = result.profile.duplicate(true)
	save_account()
	changed.emit()
	return true

func request_friend(code: String) -> bool:
	return await _social_action("/v1/friends/request", {"code": code})

func respond_friend(user_id: String, accept: bool) -> bool:
	return await _social_action("/v1/friends/respond", {"userId": user_id, "accept": accept})

func remove_friend(user_id: String) -> bool:
	return await _social_action("/v1/friends/remove", {"userId": user_id})

func _social_action(path: String, payload: Dictionary) -> bool:
	var result: Dictionary = await _request(path, HTTPClient.METHOD_POST, payload)
	if not result.get("ok", false): return _fail(str(result.get("reason", "network")))
	await refresh_friends()
	return true

func create_room() -> bool:
	var result: Dictionary = await _request("/v1/rooms", HTTPClient.METHOD_POST)
	if not result.get("ok", false): return _fail(str(result.get("reason", "network")))
	connect_room(str(result.get("roomCode", "")))
	return true

func join_room(code: String) -> bool:
	code = code.strip_edges().to_upper()
	var result: Dictionary = await _request("/v1/rooms/%s/join" % code.uri_encode(), HTTPClient.METHOD_POST)
	if not result.get("ok", false): return _fail(str(result.get("reason", "network")))
	connect_room(str(result.get("roomCode", code)))
	return true

func invite_friend(user_id: String) -> bool:
	if room_code.is_empty(): return _fail("room_not_found")
	var result: Dictionary = await _request("/v1/rooms/%s/invite" % room_code.uri_encode(), HTTPClient.METHOD_POST, {"userId": user_id})
	if not result.get("ok", false): return _fail(str(result.get("reason", "network")))
	return true

func connect_room(code: String) -> void:
	var next_code = code.strip_edges().to_upper().substr(0, 6)
	if next_code != room_code: room_state.clear()
	room_code = next_code
	save_account()
	_reconnect_attempt = 0
	_reconnect_deadline = 0
	_open_socket("room")
	changed.emit()

func connect_lobby() -> void:
	_reconnect_attempt = 0
	_reconnect_deadline = 0
	_open_socket("lobby")

func _open_socket(kind: String) -> void:
	_close_socket()
	if not _active or not configured or _token.is_empty(): return
	_socket_kind = kind
	if kind == "room": room_snapshot_ready = false
	_closed_handled = false
	_socket = WebSocketPeer.new()
	var path = "/ws/rooms/%s" % room_code.uri_encode() if kind == "room" else "/ws/lobby"
	var ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://") + path + "?token=" + _token.uri_encode()
	var error = _socket.connect_to_url(ws_url)
	_set_status("connecting" if _reconnect_attempt == 0 else "reconnecting")
	if error != OK: _closed_handled = true; _schedule_reconnect()
	set_process(true)

func _process(_delta: float) -> void:
	if not _active: return
	if _reconnect_deadline > 0 and Time.get_ticks_msec() >= _reconnect_deadline and status != "connected":
		_close_socket()
		_reconnect_deadline = 0
		_set_status("disconnected")
		_fail("reconnect_expired")
		set_process(false)
		return
	if _socket != null:
		_socket.poll()
		var ready = _socket.get_ready_state()
		if ready == WebSocketPeer.STATE_OPEN:
			if status != "connected":
				_reconnect_attempt = 0
				_reconnect_deadline = 0
				_set_status("connected")
			while _socket != null and _socket.get_available_packet_count() > 0:
				var raw = _socket.get_packet().get_string_from_utf8()
				if raw == "pong": continue
				var packet: Variant = JSON.parse_string(raw)
				if packet is Dictionary: receive_packet(packet)
		elif ready == WebSocketPeer.STATE_CLOSED and not _closed_handled:
			_closed_handled = true
			room_snapshot_ready = false
			if _socket.get_close_code() == 4001:
				_reconnect_at = 0
				_reconnect_deadline = 0
				_set_status("replaced")
				_fail("session_replaced")
				set_process(false)
				return
			_schedule_reconnect()
	if _reconnect_at > 0 and Time.get_ticks_msec() >= _reconnect_at:
		_reconnect_at = 0
		_open_socket(_socket_kind)

func receive_packet(packet: Dictionary) -> void:
	match str(packet.get("type", "")):
		"state":
			if not packet.get("state") is Dictionary: return
			room_state = packet.state.duplicate(true)
			room_snapshot_ready = true
			server_offset_ms = int(room_state.get("serverNow", local_now_ms())) - local_now_ms()
			save_account()
			room_changed.emit(room_state)
			changed.emit()
			if room_state.get("phase", "") == "finished" and _finished_profile_room != room_code:
				_finished_profile_room = room_code
				_refresh_profile()
		"ready", "social":
			refresh_friends()
		"error":
			_fail(str(packet.get("reason", "network")))

func _refresh_profile() -> void:
	var result: Dictionary = await _request("/v1/me", HTTPClient.METHOD_GET)
	if result.get("ok", false) and result.get("profile") is Dictionary:
		profile = result.profile.duplicate(true)
		save_account()
		changed.emit()

func _schedule_reconnect() -> void:
	if not _active: return
	if room_state.get("phase", "") == "finished": _set_status("disconnected"); return
	var now = Time.get_ticks_msec()
	if _reconnect_deadline == 0: _reconnect_deadline = now + 30000
	if now >= _reconnect_deadline:
		_reconnect_at = 0
		_set_status("disconnected")
		_fail("reconnect_expired")
		return
	_reconnect_at = mini(now + int(minf(0.5 * pow(2.0, mini(_reconnect_attempt, 4)), 5.0) * 1000), _reconnect_deadline)
	_reconnect_attempt += 1
	_set_status("reconnecting")

func reconnect() -> void:
	_reconnect_deadline = 0
	_reconnect_attempt = 0
	_open_socket("lobby" if room_code.is_empty() else "room")

func send_chat(text: String) -> String:
	if not room_snapshot_ready: _fail("not_ready"); return ""
	text = text.strip_edges()
	if text.is_empty() or text.length() > 160: _fail("invalid_message"); return ""
	var id = new_message_id()
	if not _send({"type": "chat", "text": text, "messageId": id, "turnId": int(room_state.get("turnId", 0))}): return ""
	return id

func start_match() -> bool:
	if not room_snapshot_ready: return _fail("not_ready")
	return _send({"type": "start"})

func leave_room() -> void:
	if not room_code.is_empty():
		_send({"type": "leave"})
		if _socket != null: _socket.poll()
	room_code = ""
	room_state.clear()
	room_snapshot_ready = false
	save_account()
	connect_lobby()
	changed.emit()

func _send(packet: Dictionary) -> bool:
	if _socket == null or _socket.get_ready_state() != WebSocketPeer.STATE_OPEN: return _fail("connection_lost")
	if _socket.send_text(JSON.stringify(packet)) != OK: return _fail("connection_lost")
	return true

func _request(path: String, method: int, payload: Dictionary = {}, authenticated: bool = true) -> Dictionary:
	return await _request_url(base_url + path, method, payload, authenticated)

func _request_url(url: String, method: int, payload: Dictionary, authenticated: bool) -> Dictionary:
	if not _active: return {"ok": false, "reason": "cancelled"}
	var request = HTTPRequest.new()
	request.timeout = 10
	request.body_size_limit = 524288
	add_child(request)
	_requests.append(request)
	var headers = PackedStringArray(["Accept: application/json", "Content-Type: application/json"])
	if authenticated and not _token.is_empty(): headers.append("Authorization: Bearer " + _token)
	var body = "" if method == HTTPClient.METHOD_GET else JSON.stringify(payload)
	if request.request(url, headers, method, body) != OK:
		_requests.erase(request)
		request.queue_free()
		return {"ok": false, "reason": "network"}
	var response = await request.request_completed
	_requests.erase(request)
	request.queue_free()
	if int(response[0]) != HTTPRequest.RESULT_SUCCESS: return {"ok": false, "reason": "network"}
	var parsed: Variant = JSON.parse_string((response[3] as PackedByteArray).get_string_from_utf8())
	if not parsed is Dictionary: return {"ok": false, "reason": "network", "http_status": int(response[1])}
	parsed["http_status"] = int(response[1])
	if not parsed.has("ok"): parsed["ok"] = int(response[1]) >= 200 and int(response[1]) < 300
	return parsed

func _fail(reason: String) -> bool:
	last_error = reason
	error_occurred.emit(reason)
	return false

func _set_status(value: String) -> void:
	if value == status: return
	status = value
	connection_changed.emit(status)

func _close_socket() -> void:
	_reconnect_at = 0
	if _socket != null: _socket.close(1000, "screen_closed")
	_socket = null

func stop() -> void:
	_active = false
	_reconnect_at = 0
	_reconnect_deadline = 0
	_close_socket()
	set_process(false)
	for request in _requests:
		if is_instance_valid(request): request.cancel_request()

func _exit_tree() -> void:
	stop()

static func local_now_ms() -> int:
	return int(Time.get_unix_time_from_system() * 1000)

func server_now_ms() -> int:
	return local_now_ms() + server_offset_ms

static func new_message_id() -> String:
	var bytes = Crypto.new().generate_random_bytes(16)
	bytes[6] = (bytes[6] & 15) | 64
	bytes[8] = (bytes[8] & 63) | 128
	var value = bytes.hex_encode()
	return "%s-%s-%s-%s-%s" % [value.substr(0, 8), value.substr(8, 4), value.substr(12, 4), value.substr(16, 4), value.substr(20, 12)]
