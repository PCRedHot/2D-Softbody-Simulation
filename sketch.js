class Vec2 {
	constructor(x, y){
		this.x = x;
		this.y = y;
	}

	negate(){
		return new Vec2(-this.x, -this.y);
	}

	normalise(){
		return this.div(this.length());
	}

	length(){
		return sqrt(this.x**2 + this.y**2);
	}

	magnetude(){
		return this.length();
	}

	dist(v){
		return this.minus(v).length();
	}

	add(v){
		return new Vec2(this.x + v.x, this.y + v.y);
	}

	minus(v){
		return new Vec2(this.x - v.x, this.y - v.y);
	}

	times(v){
		if (v instanceof Vec2) return new Vec2(this.x * v.x, this.y * v.y);
		return new Vec2(this.x * v, this.y * v);
	}

	dot(v){
		return this.x * v.x + this.y + v.y;
	}

	div(v){
		if (v instanceof Vec2) return new Vec2(this.x / v.x, this.y / v.y);
		return new Vec2(this.x / v, this.y / v);
	}

	draw(color, weight){
		stroke(color.r, color.g, color.b, color.a);
		strokeWeight(weight);
		point(this.x, this.y);
	}
}

class Line {
	constructor(o, d, t) {
		this.o = o;
		this.d = d;
		this.t = t;
	}

	isParallel(l){
		// assume d are normalised
		return this.d == l.d;
	}

	getIntersect(l){
		// return [t1, t2] where tx is the t value for the interect point on line x 
		// return null if parallel
		if (this.isParallel(l)) return null;

		let btm = this.d.y * l.d.x - l.d.y * this.d.x;
		if (btm == 0) return null;

		let t1 = (l.d.y * (this.o.x - l.o.x) - l.d.x * (this.o.y - l.o.y)) / btm;
		let t2 = ((this.o.x - l.o.x) + this.d.x * t1) / l.d.x;
		return [t1, t2];
	}

	isOnLine(t){
		return t >= 0 && t <= this.t;
	}

	getPerpendicularVector(){
		return new Vec2(-this.d.y, this.d.x);		
	}


	draw(color, weight){
		stroke(color.r, color.g, color.b, color.a);
		strokeWeight(weight);
		let end_pt = this.o.add(this.d.times(this.t));
		line(this.o.x, this.o.y, end_pt.x, end_pt.y);
	}
}

class Polygon {
	constructor(points) {
		this.corners = points;

		this.edges = [];

		for (let i = 0; i < this.corners.length; i++){
			let start_corner = this.corners[i];
			let end_corner;
			if (i == this.corners.length - 1) end_corner = this.corners[0];
			else end_corner = this.corners[i+1];

			let diff = end_corner.minus(start_corner);
			this.edges.push(new Line(start_corner, diff.normalise(), diff.length()));
		}

		// Calculate Bounding Box
		this.min_x = Infinity;
		this.min_y = Infinity;
		this.max_x = -Infinity;
		this.max_y = -Infinity;

		this.corners.forEach((corner, i) => {
			if (corner.x < this.min_x) this.min_x = corner.x;
			if (corner.y < this.min_y) this.min_y = corner.y;
			if (corner.x > this.max_x) this.max_x = corner.x;
			if (corner.y > this.max_y) this.max_y = corner.y;
		});
	}

	isInBoundingBox(p){
		let pos;
		if (p instanceof Vec2) pos = p;
		if (p instanceof SoftbodyPoint) pos = p.pos;

		return pos.x > this.min_x && pos.x < this.max_x && pos.y > this.min_y && pos.y < this.max_y;
	}
	
	checkCollision(sbp){	// After Moving
		let closest_line = null;
		let min_t = Infinity;
		let interect_count = 0;

		let trajectory = new Line(sbp.pos.minus(sbp.v), sbp.v.normalise(), sbp.v.length())

		this.edges.forEach((edge, i) => {
			let ts = edge.getIntersect(trajectory);	// intersection check
			if (edge.isOnLine(ts[0]) && trajectory.isOnLine(ts[1])) {
				interect_count += 1;
				if (ts[1] < min_t) {
					min_t = ts[1];
					closest_line = edge;
				}
			}
		});

		if (interect_count % 2 == 1){	// Odd Intersections -> Collision
			if (closest_line == null) return;	// LOL should not happen but in case

			let edge_perpendicular = closest_line.getPerpendicularVector();

			let dot_product = edge_perpendicular.dot(trajectory.d);
			if (dot_product < 0) {
				dot_product *= -1;
				edge_perpendicular = edge_perpendicular.negate();
			}

			// edge_perpendicular = edge_perpendicular.normalise();
			let new_v = sbp.v.minus(edge_perpendicular.times(sbp.v.dot(edge_perpendicular) * 2)).normalise().times(sbp.v.length());

			sbp.v = new_v.times(1-COLLISION_VELOCITY_LOSS);
			sbp.pos = trajectory.o.add(trajectory.d.times(min_t-0.1));
		}
	}

	draw(){
		this.edges.forEach((edge, i) => edge.draw(WORLD_OBJECT_LINE_COLOR, WORLD_OBJECT_LINE_WEIGHT));
	}
}


class SoftbodyPoint {
	constructor(x, y, m, r){
		this.pos = new Vec2(x, y);
		this.m = m;
		this.r = r;

		this.v = new Vec2(0, 0);
		this.f = new Vec2(0, 0);

		this.col_r = 0.1;
	}

	isInRadius(p){
		if (this.pos.dist(p.pos) == 0) return false;
		if (this.pos.dist(p.pos) < this.r) return true;
	}

	collide(p, world_objects){
		let dir = p.pos.minus(this.pos).normalise();

		let new_pos = this.pos.add(dir.times(this.r + 0.1));
	

		dir = dir.negate();
		let new_v = p.v.minus(dir.times(p.v.dot(dir) * 2)).normalise().times(p.v.length());

		p.v = new_v.times(1-INTERNAL_COLLISION_VELOCITY_LOSS);

		// check new_pos to world objects
		let collided = false;
		world_objects.forEach((polygon) => {
			if (polygon.isInBoundingBox(new_pos)) {
				let diff = new_pos.minus(p.pos);
				let trajectory = new Line(p.pos, diff.normalise(), diff.length());

				let min_t = Infinity;
				let interect_count = 0;
				polygon.edges.forEach((edge) => {
					let ts = edge.getIntersect(trajectory);	// intersection check
					if (edge.isOnLine(ts[0]) && trajectory.isOnLine(ts[1])) {
						interect_count += 1;
						if (ts[1] < min_t) {
							min_t = ts[1];
						}
					}
				});
				
				if (interect_count > 0){
					p.pos = trajectory.o.add(trajectory.d.times(min_t-0.1));
					collided = true;
				} 
			}
		});
		if (!collided) p.pos = new_pos;
		//p.pos = new_pos;
	}

	addForce(v){
		this.f = this.f.add(v);
	}

	draw(){
		this.pos.draw(SOFTBODY_POINT_COLOR, SOFTBODY_POINT_WEIGHT);
	}

}

class SoftbodySpring {
	constructor(p1, p2, ks, kd){
		assert(p1 instanceof SoftbodyPoint);
		assert(p2 instanceof SoftbodyPoint);

		this.p1 = p1;
		this.p2 = p2;
		this.l = p1.pos.dist(p2.pos);
		this.ks = ks;
		this.kd = kd;
		this.Ft = 0;
	}


	getRestLength() {return this.l; }

	getLength() { return this.p1.pos.dist(this.p2.pos); }

	getHookForceMagn() { return this.ks * (this.getLength() - this.l); }

	getDampForceMagn() {
		let diff_pos = this.p2.pos.minus(this.p1.pos).normalise();
		let diff_v = this.p2.v.minus(this.p1.v);

		return diff_pos.dot(diff_v) * this.kd;
	}

	setTotalForce() {
		this.Ft = this.getHookForceMagn() + this.getDampForceMagn();
		// if (this.Ft > 100) console.log(this.Ft);
	}

	addForceOnPoints() {
		let diff = this.p2.pos.minus(this.p1.pos);

		let F_p1 = diff.normalise().times(this.Ft);
		let F_p2 = F_p1.times(-1);

		this.p1.addForce(F_p1);
		this.p2.addForce(F_p2);
	}

	draw(){
		stroke(SOFTBODY_SPRING_COLOR.r, SOFTBODY_SPRING_COLOR.g, SOFTBODY_SPRING_COLOR.b, SOFTBODY_SPRING_COLOR.a);
		strokeWeight(SOFTBODY_SPRING_WEIGHT);
		line(this.p1.pos.x, this.p1.pos.y, this.p2.pos.x, this.p2.pos.y);
	}
		
}

class Softbody {

	constructor(){
		this.points = [];
		this.springs = [];
	}
	

	createSoftbody(starting_pos, width, height, dist, mass){
		let point_grid = [];


		// Create Points
		for (let row = 0; row < height; row++){
			let row_points = [];
			
			for (let col = 0; col < width; col++){
				let p = new SoftbodyPoint(starting_pos.x + col * dist, starting_pos.y + row * dist, mass, SOFTBODY_POINT_RADIUS);
				row_points.push(p);
				this.points.push(p);
			}

			point_grid.push(row_points);
		}

		// Create Springs
		for (let i = 0; i < height; i++) {
			for (let j = 0; j < width; j++){
				let cur_p = point_grid[i][j];
				if (i + 1 < height) this.springs.push(new SoftbodySpring(cur_p, point_grid[i+1][j], SPRING_KS, SPRING_KD));
				if (j + 1 < width) this.springs.push(new SoftbodySpring(cur_p, point_grid[i][j+1], SPRING_KS, SPRING_KD));
				if (i + 1 < height && j + 1 < width) this.springs.push(new SoftbodySpring(cur_p, point_grid[i+1][j+1], SPRING_KS, SPRING_KD));
				if (i + 1 < height && j - 1 >= 0) this.springs.push(new SoftbodySpring(cur_p, point_grid[i+1][j-1], SPRING_KS, SPRING_KD));
			}
		}

	}

	step(world_objects) {
		// F = 0
		this.points.forEach((point, i) => point.f = new Vec2(0, 0));

		// Add Forces
		this.springs.forEach((spring, i) => {	// Spring Force
			spring.setTotalForce();
			spring.addForceOnPoints();
		});
		this.points.forEach((point, i) => point.addForce(new Vec2(0, point.m * GRAVITY_ACCELERATION)));	//  Gravity

		// Add Velocity
		this.points.forEach((point, i) => point.v = point.v.add(point.f.div(point.m)));

		// Limit Velocity
		this.points.forEach((point, i) => {
			point.v = point.v.times(1-VELCOITY_LOSS);
			if (point.v.length() > MAX_VELOCITY) {
				point.v = point.v.normalise().times(MAX_VELOCITY);
			}
		});


		// Move and Self-collision
		this.points.forEach((point, i) => {
			if (point.v.length() > 0.1) point.pos = point.pos.add(point.v);
		});

		// Collision
		world_objects.forEach((polygon, i) => {
			this.points.forEach((point, i) => {
				if (polygon.isInBoundingBox(point)) polygon.checkCollision(point);
			});
		});

		// this.springs.forEach((spring) => {
		// 	if (spring.p1.isInRadius(spring.p2)){
		// 		spring.p1.collide(spring.p2, world_objects);
		// 	}
		// });
		this.points.forEach((point, i) => {
			this.points.forEach((sub_point, j) => {
				if (i != j) {
					// Self Collision Check
					if (sub_point.isInRadius(point)){
						sub_point.collide(point, world_objects);
					}
				}
	
			});
		});		
	}

	draw(){
		this.springs.forEach((spring,i) => spring.draw());
		this.points.forEach((point,i) => point.draw());
	}
}


class Color {
	constructor(r,g,b,a){
		this.r = r;
		this.g = g;
		this.b = b;
		this.a = a;
	}
}

function assert(condition) {
    if (!condition) {
        throw "Assertion failed";
    }
}

// Physical Constants
const GRAVITY_ACCELERATION = 0.015;
const SPRING_KS = 1;
const SPRING_KD = 0.00001;

const VELCOITY_LOSS = 0.005;

const COLLISION_VELOCITY_LOSS = 0.3;
const INTERNAL_COLLISION_VELOCITY_LOSS = 0.6;

const MAX_VELOCITY = 5;
const MAX_FORCE = 100;


// Softbody
const SOFTBODY_POINT_DISTANT = 30;
const SOFTBODY_POINT_RADIUS = SOFTBODY_POINT_DISTANT / 2.5;
const SOFTBODY_POINT_MASS = 8;

const SOFTBODY_WIDTH = 10;
const SOFTBODY_HEIGHT = 10;
const SOFTBODY_STARTING_POINT = new Vec2(50, 20); // anchor at top left

// Dimensions
const CANVAS_WIDTH = 1500;
const CANVAS_HEIGHT = 1000;

const SIDEBAR_WIDTH = 300;

const OUT_PADDING = 30;

// draw colors, weight
const WORLD_OBJECT_LINE_COLOR = new Color(0, 0, 0, 255); 
const WORLD_OBJECT_LINE_WEIGHT = 5;

const SOFTBODY_POINT_COLOR = new Color(255, 0, 0, 255);
const SOFTBODY_POINT_WEIGHT = 12;
const SOFTBODY_SPRING_COLOR = new Color(0, 0, 0, 200);
const SOFTBODY_SPRING_WEIGHT = 3;


let world_objects = [];
let softbody = null;

// Controls
let playing = false;

function setup(){
	createCanvas(CANVAS_WIDTH + SIDEBAR_WIDTH, CANVAS_HEIGHT);

	// walls
	world_objects.push(new Polygon([ //bottom
		new Vec2(-OUT_PADDING, -OUT_PADDING),
		new Vec2(CANVAS_WIDTH + OUT_PADDING, -OUT_PADDING),
		new Vec2(CANVAS_WIDTH + OUT_PADDING, 0),
		new Vec2(-OUT_PADDING, 0)]));	
	world_objects.push(new Polygon([ // top
		new Vec2(-OUT_PADDING, CANVAS_HEIGHT + OUT_PADDING),
		new Vec2(CANVAS_WIDTH + OUT_PADDING, CANVAS_HEIGHT + OUT_PADDING), 
		new Vec2(CANVAS_WIDTH + OUT_PADDING, CANVAS_HEIGHT), 
		new Vec2(-OUT_PADDING, CANVAS_HEIGHT)]));
	world_objects.push(new Polygon([ // left
		new Vec2(-OUT_PADDING, CANVAS_HEIGHT + OUT_PADDING),
		new Vec2(-OUT_PADDING, -OUT_PADDING), 
		new Vec2(0, -OUT_PADDING), 
		new Vec2(0, CANVAS_HEIGHT + OUT_PADDING)]));
	world_objects.push(new Polygon([ // right
		new Vec2(CANVAS_WIDTH + OUT_PADDING, -OUT_PADDING),
		new Vec2(CANVAS_WIDTH + OUT_PADDING, CANVAS_HEIGHT + OUT_PADDING),
		new Vec2(CANVAS_WIDTH, CANVAS_HEIGHT + OUT_PADDING),
		new Vec2(CANVAS_WIDTH, -OUT_PADDING)]));

	// create softbody
	softbody = new Softbody();
	softbody.createSoftbody(SOFTBODY_STARTING_POINT, SOFTBODY_WIDTH, SOFTBODY_HEIGHT, SOFTBODY_POINT_DISTANT, SOFTBODY_POINT_MASS);

}

function draw(){
	background(255);

	strokeWeight(0);
	fill(240);
	rect(CANVAS_WIDTH, 0, SIDEBAR_WIDTH, CANVAS_HEIGHT);
	

	stroke(WORLD_OBJECT_LINE_COLOR.r, WORLD_OBJECT_LINE_COLOR.g, WORLD_OBJECT_LINE_COLOR.b, WORLD_OBJECT_LINE_COLOR.a);
	strokeWeight(2);
	fill(255);
	rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	world_objects.forEach((polygon, i) => {
		if (i > 3) polygon.draw();
	});

	softbody.draw();

	if (playing) softbody.step(world_objects);
}


let clicked_points = [];
function mouseClicked() {
	console.log(new Vec2(mouseX, mouseY));	
	clicked_points.push(new Vec2(mouseX, mouseY));
}

function keyPressed() {
	if (keyCode === 13) {	// Create new world object
		world_objects.push(new Polygon(clicked_points));
		clicked_points = [];
	}

	if (keyCode === 32) playing = !playing;
}
