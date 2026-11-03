class_name ZincirPlayBilling
extends Node

## Google Play owns the payment sheet. Only the authenticated server grants items,
## verifies account binding and consumes/acknowledges a durably recorded purchase.
const PlayClient = preload("res://addons/GodotGooglePlayBilling/BillingClient.gd")

signal changed
signal notice(message: String)
signal purchase_completed(product_id: String)

var available = false
var billing_ready = false
var busy = false
var products: Dictionary = {}
var details: Dictionary = {}
var _catalog_signature = ""
var _client
var _billing
var _verifying: Dictionary = {}
var _settled: Dictionary = {}

func start(client, billing_override = null) -> bool:
	_client = client
	if _billing != null: return available
	var injected = billing_override != null and OS.is_debug_build()
	if not injected and (OS.get_name() != "Android" or not Engine.has_singleton("GodotGooglePlayBilling")):
		available = false
		changed.emit()
		return false
	_billing = billing_override if injected else PlayClient.new()
	add_child(_billing)
	available = true
	_billing.connected.connect(_on_connected)
	_billing.disconnected.connect(_on_disconnected)
	_billing.connect_error.connect(_on_connect_error)
	_billing.query_product_details_response.connect(_on_product_details)
	_billing.query_purchases_response.connect(_on_purchase_result)
	_billing.on_purchase_updated.connect(_on_purchase_result)
	_billing.set_obfuscated_account_id(("zincir:" + str(_client.profile.get("id", ""))).sha256_text())
	_billing.start_connection()
	return true

func configure_products(catalog: Array) -> void:
	var signature = JSON.stringify(catalog)
	if signature == _catalog_signature: return
	_catalog_signature = signature
	products.clear()
	details.clear()
	for item: Dictionary in catalog:
		if not item.has("goldPrice") and item.get("purchasable", false): products[str(item.get("id", ""))] = item.duplicate(true)
	if billing_ready: _query_products()
	changed.emit()

func _on_connected() -> void:
	billing_ready = true
	_query_products()
	restore_purchases()
	changed.emit()

func _on_disconnected() -> void:
	billing_ready = false
	busy = false
	changed.emit()

func _on_connect_error(_code: int, _debug_message: String) -> void:
	billing_ready = false
	busy = false
	notice.emit("Google Play bağlantısı kurulamadı. Daha sonra yeniden dene.")
	changed.emit()

func _query_products() -> void:
	if not billing_ready or products.is_empty(): return
	_billing.query_product_details(PackedStringArray(products.keys()), PlayClient.ProductType.INAPP)

func _on_product_details(response: Dictionary) -> void:
	if int(response.get("response_code", -1)) != PlayClient.BillingResponseCode.OK:
		notice.emit("Google Play ürünleri şu an yüklenemiyor.")
		return
	details.clear()
	for item: Dictionary in response.get("product_details", []):
		var id = str(item.get("product_id", ""))
		if products.has(id): details[id] = item.duplicate(true)
	restore_purchases()
	changed.emit()

func _offer(product_id: String) -> Dictionary:
	var offers: Variant = details.get(product_id, {}).get("one_time_purchase_offer_details_list", [])
	if offers is Array and not offers.is_empty() and offers[0] is Dictionary: return offers[0]
	return {}

func price_label(product_id: String) -> String:
	return str(_offer(product_id).get("formatted_price", ""))

func can_purchase(product_id: String) -> bool:
	return available and billing_ready and not busy and products.has(product_id) and details.has(product_id) and not price_label(product_id).is_empty()

func purchase(product_id: String) -> bool:
	if not can_purchase(product_id):
		notice.emit("Bu ürün şu an Google Play üzerinden satın alınamıyor.")
		return false
	busy = true
	changed.emit()
	var offer = _offer(product_id)
	var response: Dictionary = _billing.purchase(product_id, str(offer.get("purchase_option_id", "")), str(offer.get("offer_id", "")))
	if int(response.get("response_code", -1)) != PlayClient.BillingResponseCode.OK:
		busy = false
		if int(response.get("response_code", -1)) == PlayClient.BillingResponseCode.USER_CANCELED: notice.emit("Satın alma iptal edildi.")
		else: notice.emit("Google Play satın alma ekranı açılamadı.")
		changed.emit()
		return false
	return true

func restore_purchases() -> void:
	if billing_ready: _billing.query_purchases(PlayClient.ProductType.INAPP)

func _on_purchase_result(response: Dictionary) -> void:
	var code = int(response.get("response_code", -1))
	if code != PlayClient.BillingResponseCode.OK:
		busy = false
		if code == PlayClient.BillingResponseCode.USER_CANCELED: notice.emit("Satın alma iptal edildi.")
		else: notice.emit("Google Play işlemi tamamlanamadı. Satın almaları geri yükleyebilirsin.")
		changed.emit()
		return
	for purchase_data: Dictionary in response.get("purchases", []):
		var state = int(purchase_data.get("purchase_state", 0))
		if state == PlayClient.PurchaseState.PENDING:
			notice.emit("Ödeme bekleniyor. Google Play onayladığında ürün hesabına eklenecek.")
			continue
		if state != PlayClient.PurchaseState.PURCHASED: continue
		var token = str(purchase_data.get("purchase_token", ""))
		if token.is_empty(): continue
		for id: String in purchase_data.get("product_ids", []):
			if products.has(id): _verify_receipt(id, token)
	busy = false
	changed.emit()

func _verify_receipt(product_id: String, token: String) -> void:
	# Never log or persist a raw purchase token. Play keeps unconsumed purchases
	# available for retry after a network failure, process death, or app resume.
	var key = token.sha256_text()
	if _verifying.has(key) or _settled.has(key): return
	_verifying[key] = true
	var result: Dictionary = await _client.verify_google_purchase(product_id, token)
	_verifying.erase(key)
	if not is_inside_tree(): return
	if not result.get("ok", false):
		var reason = str(result.get("reason", "network"))
		if reason == "purchase_pending": notice.emit("Ödeme henüz onaylanmadı. Google Play durumunu kontrol et.")
		elif reason == "billing_not_configured": notice.emit("Google Play ödemeleri henüz açılmadı.")
		else: notice.emit("Satın alma doğrulanamadı. Ücretli ürün yerel olarak eklenmedi; geri yüklemeyi deneyebilirsin.")
		return
	if not result.get("ackPending", false): _settled[key] = true
	if _settled.size() > 128: _settled.erase(_settled.keys()[0])
	purchase_completed.emit(product_id)
	notice.emit("Ürün hesabına eklendi. Google Play işlemi tamamlanıyor." if result.get("ackPending", false) else "Satın alma tamamlandı. Ürün hesabına eklendi.")
	changed.emit()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_RESUMED:
		if billing_ready: restore_purchases()
		elif available and _billing != null: _billing.start_connection()

func _exit_tree() -> void:
	if _billing != null: _billing.end_connection()
