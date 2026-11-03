extends SceneTree

const Adapter = preload("res://scripts/play_billing.gd")
var checks = 0
var failures = 0

class FakeBilling extends Node:
	signal connected
	signal disconnected
	signal connect_error(code: int, message: String)
	signal query_product_details_response(response: Dictionary)
	signal query_purchases_response(response: Dictionary)
	signal on_purchase_updated(response: Dictionary)
	var account_id = ""
	var query_count = 0
	var owned: Array = []
	var purchase_calls: Array = []
	var local_ack_calls = 0
	func set_obfuscated_account_id(value: String) -> void: account_id = value
	func start_connection() -> void: connected.emit()
	func end_connection() -> void: pass
	func query_product_details(ids: PackedStringArray, _type: int) -> void:
		var items: Array = []
		for id in ids: items.append({"product_id": id, "one_time_purchase_offer_details_list": [{"formatted_price": "₺29,99", "purchase_option_id": "buy", "offer_id": ""}]})
		query_product_details_response.emit({"response_code": 0, "product_details": items})
	func query_purchases(_type: int) -> void:
		query_count += 1
		query_purchases_response.emit({"response_code": 0, "purchases": owned})
	func purchase(id: String, option: String, offer: String) -> Dictionary:
		purchase_calls.append([id, option, offer])
		return {"response_code": 0}
	func consume_purchase(_token: String) -> void: local_ack_calls += 1
	func acknowledge_purchase(_token: String) -> void: local_ack_calls += 1

class FakeClient extends Node:
	var profile = {"id": "fixture-account", "gold": 100}
	var calls = 0
	var response = {"ok": true, "acknowledged": true, "consumable": true}
	func verify_google_purchase(_product_id: String, _token: String) -> Dictionary:
		calls += 1
		await get_tree().process_frame
		return response.duplicate(true)

func check(value: bool, message: String) -> void:
	checks += 1
	if not value: failures += 1; push_error(message)

func _initialize() -> void: _run.call_deferred()

func settle() -> void:
	for index in 4: await process_frame

func _run() -> void:
	var client = FakeClient.new()
	root.add_child(client)
	var desktop = Adapter.new()
	root.add_child(desktop)
	check(not desktop.start(client) and not desktop.available, "Desktop without Play singleton must never enable payments.")
	check(not desktop.purchase("gold_500"), "Unavailable native billing must never simulate a purchase.")
	desktop.queue_free()
	await settle()
	var billing = FakeBilling.new()
	var adapter = Adapter.new()
	root.add_child(adapter)
	adapter.configure_products([{"id": "gold_500", "purchasable": true}, {"id": "remove_ads", "purchasable": false}, {"id": "hint_pack_2", "goldPrice": 25, "purchasable": true}])
	check(adapter.start(client, billing), "The isolated debug fixture can supply the real plugin signal contract.")
	check(billing.account_id == "zincir:fixture-account".sha256_text(), "Play purchases must bind to a hashed server account ID.")
	check(adapter.can_purchase("gold_500") and adapter.price_label("gold_500") == "₺29,99", "Product availability and localized price must come from queried Play details.")
	check(not adapter.can_purchase("remove_ads") and not adapter.can_purchase("hint_pack_2"), "Server-disabled and gold-only products must never enter Play billing.")
	check(adapter.purchase("gold_500") and billing.purchase_calls == [["gold_500", "buy", ""]], "Only a queried product may launch the genuine purchase option.")
	billing.on_purchase_updated.emit({"response_code": 1})
	check(not adapter.busy and client.calls == 0 and client.profile.gold == 100, "Cancellation must never call verification or grant items.")
	billing.on_purchase_updated.emit({"response_code": 0, "purchases": [{"purchase_state": 2, "purchase_token": "fixture-pending-token", "product_ids": ["gold_500"]}]})
	await settle()
	check(client.calls == 0 and client.profile.gold == 100, "Pending Play purchases must not grant or verify a completed entitlement.")
	billing.on_purchase_updated.emit({"response_code": 0, "purchases": [{"purchase_state": 0, "purchase_token": "fixture-unknown-token", "product_ids": ["gold_500"]}]})
	billing.on_purchase_updated.emit({"response_code": 0, "purchases": [{"purchase_state": 1, "purchase_token": "fixture-product-token", "product_ids": ["unknown_product"]}]})
	await settle()
	check(client.calls == 0, "Unknown products or unspecified purchase state must not reach entitlement verification.")
	var completed = {"response_code": 0, "purchases": [{"purchase_state": 1, "purchase_token": "fixture-completed-token", "product_ids": ["gold_500"]}]}
	billing.on_purchase_updated.emit(completed)
	billing.on_purchase_updated.emit(completed)
	await settle()
	check(client.calls == 1 and adapter._settled.size() == 1, "Concurrent and repeated purchase signals must verify once in the current adapter session.")
	check(billing.local_ack_calls == 0, "Client must never consume or acknowledge; server owns durable grant and finalization.")
	client.response = {"ok": false, "reason": "network"}
	billing.owned = [{"purchase_state": 1, "purchase_token": "fixture-retry-token", "product_ids": ["gold_500"]}]
	adapter.restore_purchases()
	await settle()
	check(client.calls == 2 and adapter._settled.size() == 1, "A network failure must leave a purchased token retryable without local grant.")
	client.response = {"ok": true, "ackPending": true}
	adapter.restore_purchases()
	await settle()
	check(client.calls == 3 and adapter._settled.size() == 1, "Server ackPending must remain retryable after durable server entitlement.")
	client.response = {"ok": true, "acknowledged": true}
	adapter._notification(Node.NOTIFICATION_APPLICATION_RESUMED)
	await settle()
	check(client.calls == 4 and adapter._settled.size() == 2, "App resume must retry unfinished receipt finalization.")
	billing.disconnected.emit()
	check(not adapter.can_purchase("gold_500"), "Disconnected billing cannot launch a stale purchase flow.")
	adapter.queue_free()
	client.queue_free()
	await settle()
	print("Native Play billing adapter: %d checks, %d failures." % [checks, failures])
	quit(1 if failures else 0)
