extends SceneTree

const Client = preload("res://scripts/online_client.gd")
const Screen = preload("res://scripts/online_screen.gd")
const TEST_PREFIX = "user://zincir_online_native_test"
var checks = 0
var failures = 0
var view
var fake
var scroller: ScrollContainer
var returned_home = false

class FakeClient extends "res://scripts/online_client.gd":
	var calls: Array = []
	var sent: Array = []
	func _init() -> void:
		account_path = "user://zincir_online_native_test_mock.json"
	func start(_player_name: String, _config_path: String = DEFAULT_CONFIG) -> bool:
		configured = true
		base_url = "http://127.0.0.1:8787"
		profile = {"id": "fixture-a", "code": "1465", "name": "Gökçen", "wins": 0, "played": 0, "avatar": "mascot-boy", "gold": 100, "inventory": {"hint": 0, "letter": 0}}
		_token = "fixture-only-not-a-real-session-token"
		_set_status("connected")
		changed.emit()
		return true
	func _request(path: String, method: int, payload: Dictionary = {}, _authenticated: bool = true) -> Dictionary:
		calls.append({"path": path, "method": method, "body": payload.duplicate(true)})
		if path == "/v1/friends": return {"ok": true, "friends": friends, "incoming": incoming, "outgoing": outgoing, "invites": invites}
		if path == "/v1/me": return {"ok": true, "profile": profile}
		if path == "/v1/profile":
			var renamed = profile.duplicate(true)
			renamed.name = payload.get("name", "")
			renamed.avatar = payload.get("avatar", "mascot-boy")
			return {"ok": true, "profile": renamed}
		if path == "/v1/history": return {"ok": true, "history": [{"roomCode": "HIS234", "opponent": {"name": "Deniz", "avatar": "mascot-girl", "isBot": true}, "result": "win", "score": [2, 1], "finishedAt": 10000000, "review": [{"prompt": "SU", "answer": "BARDAĞI", "stem": "BARDAK"}]}]}
		if path == "/v1/shop": return {"ok": true, "gold": 100, "inventory": {"hint": 0, "letter": 0}, "products": [{"id": "hint_pack", "title": "2 ipucu", "goldPrice": 25, "purchasable": true}, {"id": "remove_ads", "title": "Reklamları kaldır", "purchasable": false}]}
		if path == "/v1/matchmaking/join": return {"ok": true, "status": "waiting", "botAfterAt": local_now_ms() + 15000}
		if path == "/v1/matchmaking/cancel": return {"ok": true, "status": "idle"}
		if path == "/v1/rooms" or path.ends_with("/join"): return {"ok": true, "roomCode": "ABC234"}
		return {"ok": true}
	func _open_socket(kind: String) -> void:
		_socket_kind = kind
		room_snapshot_ready = false if kind == "room" else room_snapshot_ready
		_set_status("connected")
		set_process(false)
	func _send(packet: Dictionary) -> bool:
		sent.append(packet.duplicate(true))
		return true

class RestoreClient extends "res://scripts/online_client.gd":
	var active_code: Variant = "NEW234"
	func _request(path: String, _method: int, _payload: Dictionary = {}, _authenticated: bool = true) -> Dictionary:
		if path == "/v1/me": return {"ok": true, "profile": {"id": "fixture-a", "code": "1465", "name": "Gökçen"}, "activeRoom": active_code}
		return {"ok": true, "friends": [], "incoming": [], "outgoing": [], "invites": []}
	func _open_socket(kind: String) -> void:
		_socket_kind = kind
		_set_status("connected")
		set_process(false)

func _initialize() -> void:
	_run.call_deferred()

func check(condition: bool, description: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		push_error(description)

func settle() -> void:
	for i in 5: await process_frame

func capture_frame(name: String) -> void:
	if OS.get_environment("ZINCIR_CAPTURE_ONLINE") != "1": return
	await settle()
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://output/" + name)

func wait_for(predicate: Callable, milliseconds: int = 5000) -> bool:
	var deadline = Time.get_ticks_msec() + milliseconds
	while not predicate.call() and Time.get_ticks_msec() < deadline:
		await process_frame
	return bool(predicate.call())

func clean_files() -> void:
	for suffix in ["_mock.json", "_a.json", "_b.json", "_copy.json", "_config.json", "_disabled.json"]:
		for ending in ["", ".tmp"]:
			var path = TEST_PREFIX + suffix + ending
			if FileAccess.file_exists(path): DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

func put_json(path: String, value: Dictionary) -> void:
	var file = FileAccess.open(path, FileAccess.WRITE)
	file.store_string(JSON.stringify(value))
	file.close()

func snapshot(phase: String = "playing") -> Dictionary:
	return {"roomCode": "ABC234", "phase": phase, "players": [{"id": "fixture-a", "name": "Gökçen", "code": "1465", "score": 0, "roundWins": 0, "connected": true, "gold": 100, "avatar": "mascot-boy"}, {"id": "fixture-b", "name": "Abcdefghijklmnopqr", "code": "1466", "score": 0, "roundWins": 0, "connected": true, "gold": 100, "avatar": "mascot-girl"}], "activePlayerId": "fixture-a", "deadlineAt": Client.local_now_ms() + (3000 if phase == "countdown" else 30000), "serverNow": Client.local_now_ms(), "turnId": 1, "activeIndex": 1, "chain": [{"stem": "ÇAY", "answer": "ÇAY", "status": "solved"}, {"first": "K", "length": 6, "status": "hidden"}, {"first": "O", "length": 5, "status": "hidden"}, {"first": "H", "length": 6, "status": "hidden"}, {"first": "D", "length": 6, "status": "hidden"}], "messages": [], "winnerId": null, "lastCorrect": null, "roundNumber": 1, "roundResult": null, "continueReady": []}

func has_wrong_label(node: Node) -> bool:
	if node is Screen.WrongGuessLabel: return true
	for child in node.get_children():
		if has_wrong_label(child): return true
	return false

func check_layout(label: String) -> void:
	var minimum = view.get_combined_minimum_size().x
	check(minimum <= root.size.x + 1, "%s minimum width should fit the native viewport (%.1f / %d)." % [label, minimum, root.size.x])

func _run() -> void:
	clean_files()
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size = Vector2i.ZERO
	root.size = Vector2i(390, 844)
	if OS.get_environment("ZINCIR_CAPTURE_ONLINE") == "1": OS.low_processor_usage_mode = false
	check(Client.valid_base_url("https://online.example.workers.dev"), "Public backend URL should permit HTTPS.")
	check(Client.valid_base_url("http://127.0.0.1:8787"), "Explicit local test endpoint should be supported.")
	check(not Client.valid_base_url("http://example.com") and not Client.valid_base_url(""), "Empty or insecure public URLs must not connect.")
	var ids = {}
	for i in 50: ids[Client.new_message_id()] = true
	check(ids.size() == 50, "Chat commands should use fresh message UUIDs.")
	scroller = ScrollContainer.new()
	scroller.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroller.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroller.follow_focus = true
	root.add_child(scroller)
	fake = FakeClient.new()
	fake.account_path = TEST_PREFIX + "_mock.json"
	view = Screen.new()
	view.setup("Gökçen", "", fake, "friends")
	view.return_home.connect(func(): returned_home = true)
	scroller.add_child(view)
	await settle()
	check(view._mode == "lobby" and view._code_label.text == "#1465", "Lobby should display the persistent public friend code.")
	view._friend_input.text = "#1466"
	await view._request_friend()
	check(fake.calls.any(func(call): return call.path == "/v1/friends/request" and call.body.code == "#1466"), "Friend request should use the public code endpoint.")
	fake.incoming = [{"id": "fixture-b", "name": "Deniz", "code": "1466"}]
	fake.changed.emit()
	await view._respond("fixture-b", true)
	check(fake.calls.any(func(call): return call.path == "/v1/friends/respond" and call.body.accept), "Accepting a friend should explicitly respond to the request.")
	fake.friends = [{"id": "fixture-b", "name": "Abcdefghijklmnopqr", "code": "1466"}]
	fake.incoming = []
	fake.changed.emit()
	for width in [276, 320, 390, 900]:
		root.size = Vector2i(width, 844)
		await settle()
		check_layout("Lobby %d" % width)
	root.size = Vector2i(390, 844)
	await settle()
	await capture_frame("native-online-lobby.png")
	await view._create_room()
	await settle()
	check(view._mode == "room" and fake.room_code == "ABC234", "Creating a room should switch to its live screen.")
	check(view._send_button.disabled and not fake.room_snapshot_ready, "Chat must remain gated until the first full server snapshot.")
	var state = snapshot("waiting")
	fake.receive_packet({"type": "state", "state": state})
	await settle()
	view._start_button.pressed.emit()
	check(fake.sent.back().type == "start" and fake.room_state.phase == "waiting", "Start should send a command without inventing a local match start.")
	state = snapshot("countdown")
	fake.receive_packet({"type": "state", "state": state})
	check(view._clock_label.text in ["3", "2"], "Countdown should derive from the authoritative server deadline.")
	state = snapshot()
	fake.receive_packet({"type": "state", "state": state})
	await settle()
	check(view._question_label.text == "ÇAY → K_____", "The battle question should be one SU → B_____ style strip with inflected answer length.")
	check(view._clock_label.text.contains("30") and view._chat_input.editable, "The active player should receive a thirty-second editable turn.")
	await create_timer(0.3).timeout
	await settle()
	check(view._chat_input.get_global_rect().end.y <= 844, "Normal portrait battle must keep its answer input on screen.")
	await capture_frame("native-online-playing.png")
	var input_id = view._chat_input.get_instance_id()
	view._chat_input.text = "kaşık"
	view._send_chat()
	var first_id = view._pending_message_id
	check(not first_id.is_empty() and view._chat_input.text == "kaşık", "Draft should remain until the server acknowledges its UUID.")
	check(fake.sent.back().turnId == 1 and fake.sent.back().messageId == first_id, "Message should carry the observed turn and a fresh UUID.")
	fake.receive_packet({"type": "error", "reason": "stale_turn"})
	check(view._chat_input.text == "kaşık" and view._pending_message_id.is_empty(), "Old-turn rejection should preserve the draft for retry.")
	view._send_chat()
	var accepted_id = view._pending_message_id
	state.messages = [{"id": "1", "clientMessageId": accepted_id, "playerId": "fixture-b", "name": "Deniz", "text": "kaşık", "kind": "chat", "at": Client.local_now_ms()}]
	fake.receive_packet({"type": "state", "state": state})
	check(view._chat_input.text == "kaşık", "Another player's matching UUID must not acknowledge this account's draft.")
	state.messages = [{"id": "2", "clientMessageId": accepted_id, "playerId": "fixture-a", "name": "Gökçen", "text": "kaşık", "kind": "wrong", "at": Client.local_now_ms()}]
	fake.receive_packet({"type": "state", "state": state})
	check(view._chat_input.text.is_empty() and view._pending_message_id.is_empty(), "Own clientMessageId acknowledgement should clear exactly the submitted draft.")
	check(fake.room_state.activeIndex == 1 and fake.room_state.turnId == 1, "Wrong answers must not locally advance the authoritative turn.")
	var bubble = view._message_nodes["2"]
	check(has_wrong_label(bubble), "Wrong guesses should render with a red strike label.")
	view._chat_input.text = "[b]sohbet[/b]"
	view._send_chat()
	var undelivered = view._pending_message_id
	view._on_connection("reconnecting")
	fake.room_snapshot_ready = false
	fake.receive_packet({"type": "state", "state": state})
	check(not undelivered.is_empty() and view._pending_message_id.is_empty() and view._chat_input.text == "[b]sohbet[/b]", "Reconnect snapshot without an acknowledgement should retain draft and permit retry.")
	for width in [276, 320, 390, 900]:
		root.size = Vector2i(width, 844)
		await settle()
		check_layout("Playing %d" % width)
		check(view._chat_input.get_instance_id() == input_id and view._chat_input.text == "[b]sohbet[/b]", "Resizing must preserve the native input node and its draft.")
	var nodes_before = view._scoreboard.get_child(0).get_instance_id()
	await create_timer(0.3).timeout
	check(view._chat_input.get_instance_id() == input_id and view._scoreboard.get_child(0).get_instance_id() == nodes_before, "Clock ticks should update labels without rebuilding input or score cards.")
	state.chain[1] = {"stem": "KAŞIK", "answer": "KAŞIĞI", "status": "solved"}
	state.activeIndex = 2
	state.turnId = 2
	state.players[0].score = 100
	state.activePlayerId = "fixture-b"
	state.lastCorrect = {"answer": "KAŞIĞI", "stem": "KAŞIK", "index": 1, "at": Client.local_now_ms(), "turnId": 1, "playerId": "fixture-a"}
	state.messages[0].text = "kaşık"
	state.messages.append({"id": "3", "playerId": "fixture-b", "name": "Deniz", "text": "naber lan", "kind": "chat", "at": Client.local_now_ms()})
	state.messages.append({"id": "4", "playerId": "fixture-a", "name": "Gökçen", "text": "kaşığı", "kind": "correct", "at": Client.local_now_ms()})
	fake.receive_packet({"type": "state", "state": state})
	check(view._correct_label.text == "KAŞIĞI → KAŞIK", "Accepted inflected answers should show their short stem explanation.")
	check(view._question_label.text == "KAŞIK → O____", "The next question should use the correctly revealed stem.")
	check(not view._chat_input.editable and view._send_button.disabled, "The inactive player must not type or send during the opponent's turn.")
	check(fake.send_chat("naber lan").is_empty() and fake.last_error == "not_your_turn", "The native transport must reject inactive-player conversation before sending.")
	root.size = Vector2i(320, 300)
	view._error_label.hide()
	view._update_battle_layout()
	await settle()
	scroller.scroll_vertical = 0
	await settle()
	check(view._question_label.get_global_rect().position.y >= 0 and view._chat_input.get_global_rect().end.y <= 301, "Question/composer should fit 320×300: %s / %s" % [view._question_label.get_global_rect(), view._chat_input.get_global_rect()])
	await capture_frame("native-online-keyboard-battle.png")
	root.size = Vector2i(390, 844)
	view._update_battle_layout()
	await settle()
	if OS.get_environment("ZINCIR_CAPTURE_ONLINE") == "1":
		root.size = Vector2i(390, 844)
		view._chat_input.text = ""
		await settle()
		scroller.ensure_control_visible(view._chat_input)
		await capture_frame("native-online-chat.png")
		view._chat_input.text = "[b]sohbet[/b]"
	view._chat_input.grab_focus()
	check(view.focus_control() == view._chat_input, "Main keyboard hook should find the online native input.")
	view.request_home()
	check(is_instance_valid(view._leave_prompt) and not returned_home, "Back during a match should ask before forfeiting.")
	view.request_home()
	check(not is_instance_valid(view._leave_prompt) and view._chat_input.text == "[b]sohbet[/b]", "Cancelling a leave prompt should preserve the draft.")
	state.phase = "round_end"
	state.players[0].roundWins = 1
	state.roundResult = {"winnerId": "fixture-a", "tieBreak": "sudden_death", "scores": [{"id": "fixture-a", "score": 200}, {"id": "fixture-b", "score": 200}]}
	state.continueReady = []
	fake.receive_packet({"type": "state", "state": state})
	check(view._continue_button.visible and not view._continue_button.disabled and not view._chat_input.editable, "A completed round should offer Continue and keep answer input locked.")
	view._continue_button.pressed.emit()
	check(fake.sent.back().type == "continue", "Continue must send a server command without locally inventing a round.")
	state.continueReady = ["fixture-a"]
	fake.receive_packet({"type": "state", "state": state})
	check(view._continue_button.disabled and view._continue_button.text.contains("BEKLENİYOR"), "The first ready player should wait for the opponent.")
	state.phase = "finished"
	state.players[0].roundWins = 2
	state.winnerId = "fixture-a"
	state.tieBreak = "sudden_death"
	state.endReason = "chain_complete"
	fake.receive_packet({"type": "state", "state": state})
	check(view._result_text.text.contains("2 – 0") and not view._continue_button.visible, "A 2–0 series should finish without an extra Continue action.")
	state.players[1].roundWins = 1
	state.roundNumber = 3
	fake.receive_packet({"type": "state", "state": state})
	check(view._result_text.text.contains("2 – 1") and not view._continue_button.visible, "A deciding third round should show the 2–1 final series result.")
	check(not view._result_text.text.contains("süre"), "Response speed must never break a tied score.")
	state.review = [{"prompt": "SU", "answer": "BARDAĞI", "stem": "BARDAK", "status": "missed"}, {"prompt": "ÇAY", "answer": "KAŞIĞI", "stem": "KAŞIK", "status": "correct"}]
	fake.receive_packet({"type": "state", "state": state})
	check(view._result_text.text.contains("SU → BARDAĞI") and view._result_text.text.contains("ÇAY → KAŞIĞI"), "Both missed answers and last solved answers should remain visible on final results.")
	state = snapshot()
	state.question = {"prompt": "SU", "first": "B", "length": 7, "revealed": [{"index": 2, "letter": "R"}], "hint": "İçecek kabı"}
	state.players[0].gold = 100
	state.players[0].jokers = {"hintUsed": 1, "letterUsed": 2, "hintLimit": 2, "letterLimit": 4}
	state.suddenDeath = true
	state.questionNumber = 7
	fake.receive_packet({"type": "state", "state": state})
	check(view._question_label.text == "SU → B_R____" and view._hint_text.text == "İçecek kabı", "Server question and purchased letter/hint must render directly without guessing private answers.")
	check(view._hint_button.text.contains("1/2") and view._letter_button.text.contains("2/4") and view._composer_clue.text.contains("Uzatma"), "Per-player match joker caps and sudden death should be explained.")
	view._use_joker("letter")
	check(fake.sent.back().type == "joker" and fake.sent.back().kind == "letter" and fake.sent.back().turnId == 1, "Joker purchase must be an authoritative command with turn identity.")
	state.players[0].jokers = {"hintUsed": 2, "letterUsed": 4}
	fake.receive_packet({"type": "state", "state": state})
	check(view._hint_button.disabled and view._letter_button.disabled, "Exhausted match caps must disable both joker controls.")
	fake.room_code = ""
	fake.room_state = {}
	await view._open_section("choose")
	check(view._mode == "choose", "Online mode should present friend/random choice.")
	await view._open_section("random")
	await view._toggle_matchmaking()
	check(fake.matchmaking.get("status") == "waiting" and view._queue_button.text.contains("İPTAL"), "Random queue should expose cancellation and wait for server pairing.")
	await view._toggle_matchmaking()
	check(fake.matchmaking.get("status") == "idle", "Queue cancellation must be persisted through the endpoint.")
	await view._open_section("history")
	check(view._mode == "history" and fake.history.size() == 1, "Match history should load authenticated server results.")
	await view._open_section("shop")
	check(fake.shop.products.size() == 2 and view._wallet_label.text.contains("100"), "Shop must use server wallet and catalog.")
	await view._buy_product("hint_pack")
	check(fake.calls.any(func(call): return call.path == "/v1/shop/buy" and call.body.productId == "hint_pack" and not str(call.body.requestId).is_empty()), "Gold purchases must use a unique server transaction request ID.")
	for width in [276, 320, 390, 900]:
		root.size = Vector2i(width, 844)
		await settle()
		check_layout("Shop %d" % width)
	fake.room_code = "ABC234"
	fake.room_state = {"phase": "finished"}
	fake.save_account()
	var reload = Client.new()
	reload.account_path = fake.account_path
	reload.load_account()
	check(reload.profile.id == "fixture-a" and reload.room_code.is_empty(), "Device identity should persist while a finished room is removed from resume state.")
	reload.free()
	view.queue_free()
	await settle()
	check(not is_instance_valid(fake), "Leaving the online UI should free its client and cancel its background work.")
	scroller.queue_free()
	await settle()
	put_json(TEST_PREFIX + "_config.json", {"baseUrl": "http://127.0.0.1:8787"})
	put_json(TEST_PREFIX + "_mock.json", {"version": 1, "token": "fixture-only-not-a-real-session-token", "profile": {"id": "fixture-a"}, "roomCode": "OLD234"})
	var restored = RestoreClient.new()
	restored.account_path = TEST_PREFIX + "_mock.json"
	root.add_child(restored)
	check(await restored.start("Gökçen", TEST_PREFIX + "_config.json"), "A saved device session should restore without registering again.")
	check(restored.room_code == "NEW234" and restored._socket_kind == "room", "Server active-room identity should supersede a stale saved room code.")
	restored.active_code = null
	await restored.start("Gökçen", TEST_PREFIX + "_config.json")
	check(restored.room_code.is_empty() and restored._socket_kind == "lobby", "Server-cleared active room should return a restored account to the lobby.")
	restored.queue_free()
	await settle()
	if OS.get_environment("ZINCIR_SKIP_TRANSPORT_TEST") != "1": await _actual_transport()
	clean_files()
	print("Native online: %d checks, %d failures." % [checks, failures])
	quit(1 if failures else 0)

func _actual_transport() -> void:
	var port_text = OS.get_environment("ZINCIR_ONLINE_TEST_PORT")
	var port = port_text.to_int() if port_text.is_valid_int() else 8787
	var explicit_url = OS.get_environment("ZINCIR_ONLINE_TEST_URL").strip_edges()
	var test_url = explicit_url if not explicit_url.is_empty() else "http://127.0.0.1:%d" % clampi(port, 1, 65535)
	check(Client.valid_base_url(test_url), "Explicit integration-test URL should use HTTPS or a local test port.")
	put_json(TEST_PREFIX + "_config.json", {"baseUrl": test_url})
	var a = Client.new()
	var b = Client.new()
	a.account_path = TEST_PREFIX + "_a.json"
	b.account_path = TEST_PREFIX + "_b.json"
	root.add_child(a)
	root.add_child(b)
	var name_prefix = "Yerel" if explicit_url.is_empty() else "Godot QA"
	var a_ready: bool = await a.start(name_prefix + " Arda", TEST_PREFIX + "_config.json")
	var b_ready: bool = await b.start(name_prefix + " Deniz", TEST_PREFIX + "_config.json")
	check(a_ready and b_ready, "Local backend should register two native device profiles without production config changes (%s / %s)." % [a.last_error, b.last_error])
	if not a_ready or not b_ready:
		a.queue_free(); b.queue_free(); await settle(); return
	check(not a.profile.code.is_empty() and a.profile.id != b.profile.id, "Real native accounts should receive distinct server identities and public codes.")
	check(await wait_for(func(): return a.status == "connected"), "The first real lobby socket should connect before session replacement.")
	var takeover = Client.new()
	takeover.account_path = a.account_path
	takeover.load_account()
	takeover.account_path = TEST_PREFIX + "_copy.json"
	takeover.save_account()
	root.add_child(takeover)
	check(await takeover.start("Yerel Yedek", TEST_PREFIX + "_config.json"), "Existing native device session should restore without creating another account.")
	check(await wait_for(func(): return a.status == "replaced"), "Server close4001 should pause the replaced native session.")
	await create_timer(0.6).timeout
	check(a.status == "replaced" and a._reconnect_at == 0 and not a.is_processing(), "A replaced connection must not fight the new connection through automatic reconnects.")
	takeover.queue_free()
	await settle()
	a.reconnect()
	check(await wait_for(func(): return a.status == "connected"), "Explicit user reconnect should restore the native lobby.")
	check(await a.request_friend("#" + str(b.profile.code)), "Real REST friend request should succeed.")
	await b.refresh_friends()
	check(b.incoming.any(func(person): return person.id == a.profile.id), "Incoming request must be visible before acceptance.")
	check(await b.respond_friend(str(a.profile.id), true), "Real REST friend acceptance should succeed.")
	await a.refresh_friends()
	check(a.friends.any(func(person): return person.id == b.profile.id), "Accepted friend should be persisted by the server.")
	check(await a.create_room(), "Real room creation should succeed.")
	check(await wait_for(func(): return a.room_snapshot_ready), "Native WebSocket should receive its first authenticated room snapshot.")
	check(await b.join_room(a.room_code), "Second native account should join through the room code.")
	check(await wait_for(func(): return a.room_state.get("players", []).size() == 2 and b.room_snapshot_ready), "Both native sockets should observe the same two-player room.")
	check(a.start_match(), "Host should send start over the actual WebSocket.")
	check(await wait_for(func(): return a.room_state.get("phase", "") == "countdown"), "Server should begin the real three-second countdown.")
	check(await wait_for(func(): return a.room_state.get("phase", "") == "playing", 6000), "Server should enter a real thirty-second turn.")
	if a.room_state.get("phase", "") != "playing": a.queue_free(); b.queue_free(); await settle(); return
	check(int(a.room_state.get("questionsPerRound", 0)) == 6, "Actual backend must expose six questions per round.")
	var active = a if a.room_state.activePlayerId == a.profile.id else b
	var inactive = b if active == a else a
	check(inactive.send_chat("naber lan").is_empty() and inactive.last_error == "not_your_turn", "Inactive native transport must reject all chat.")
	check(active.send_joker("hint"), "Active native player should send a purchased hint.")
	check(await wait_for(func(): return a.room_state.get("question", {}).get("hint") != null), "Hint must arrive from the server snapshot.")
	check(active.send_joker("letter"), "Active native player should send a purchased letter.")
	check(await wait_for(func(): return a.room_state.get("question", {}).get("revealed", []).size() > 0), "Purchased letter should be server-selected and visible.")
	var active_id = str(active.profile.id)
	var spent = false
	for person: Dictionary in a.room_state.players:
		if str(person.id) == active_id: spent = int(person.get("jokers", {}).get("hintUsed", 0)) == 1 and int(person.get("jokers", {}).get("letterUsed", 0)) == 1
	check(spent, "Each joker should count against that player's match cap.")
	b.leave_room()
	check(await wait_for(func(): return a.room_state.get("phase", "") == "finished"), "Explicit forfeit should end the authoritative native match.")
	check(await a.refresh_history() and not a.history.is_empty(), "Native match history must load a completed server record.")
	check(await a.refresh_shop() and a.shop.get("products", []).size() > 0, "Native shop catalog must load from live backend.")
	for product: Dictionary in a.shop.get("products", []):
		if not product.has("goldPrice"): check(not product.get("purchasable", true), "Real-money products must remain unavailable until receipt validation is configured.")
	a.leave_room()
	await settle()
	check(await a.join_matchmaking(), "Native random queue join should succeed.")
	check(await b.join_matchmaking(), "A second native account should join the matching queue.")
	check(await wait_for(func(): return not a.room_code.is_empty() and a.room_code == b.room_code, 10000), "Two native waiting players should match each other before bot fallback.")
	check(await wait_for(func(): return a.room_state.get("phase", "") == "playing", 10000), "Random human match should begin automatically after countdown.")
	b.leave_room()
	check(await wait_for(func(): return a.room_state.get("phase", "") == "finished"), "Random match leave should finish cleanly.")
	var copy = Client.new()
	copy.account_path = a.account_path
	copy.load_account()
	check(copy.profile.id == a.profile.id and copy.room_code.is_empty(), "Real device session should persist and clear only the finished room.")
	copy.free()
	a.queue_free()
	b.queue_free()
	await settle()
