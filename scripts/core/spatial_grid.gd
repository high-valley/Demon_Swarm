class_name SpatialGrid
extends RefCounted
## 一様グリッドの空間分割。毎ティック作り直す前提の単純な実装。
## 1000体を目指す段階では、ここを差し替えればAI側は変更不要。

var cell: float
var cells: Dictionary = {}


func _init(cell_size: float) -> void:
	cell = cell_size


func clear() -> void:
	cells.clear()


func add(u: Object) -> void:
	var k := Vector2i(floori(u.pos.x / cell), floori(u.pos.y / cell))
	var bucket: Variant = cells.get(k)
	if bucket == null:
		cells[k] = [u]
	else:
		bucket.append(u)


func query(p: Vector2, radius: float) -> Array:
	var out: Array = []
	var x0 := floori((p.x - radius) / cell)
	var x1 := floori((p.x + radius) / cell)
	var y0 := floori((p.y - radius) / cell)
	var y1 := floori((p.y + radius) / cell)
	for cx in range(x0, x1 + 1):
		for cy in range(y0, y1 + 1):
			var bucket: Variant = cells.get(Vector2i(cx, cy))
			if bucket != null:
				out.append_array(bucket)
	return out


func nearest(p: Vector2, radius: float, filter: Callable = Callable()) -> Unit:
	var best: Unit = null
	var best_d := radius * radius
	for u in query(p, radius):
		if u.dead:
			continue
		if filter.is_valid() and not filter.call(u):
			continue
		var d := p.distance_squared_to(u.pos)
		if d < best_d:
			best_d = d
			best = u
	return best


func count(p: Vector2, radius: float) -> int:
	var n := 0
	var r2 := radius * radius
	for u in query(p, radius):
		if not u.dead and p.distance_squared_to(u.pos) < r2:
			n += 1
	return n
