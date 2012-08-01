
/**
 * @author Hakim El Hattab
 */
var Radar = (function(){

	var NODES_X = 12,
		NODES_Y = 12,

		PULSE_VELOCITY = 0.01,
		PULSE_QUANTITY = 2,

		// Distance threshold between active node and pulse
		ACTIVATION_DISTANCE = 20,

		// Number of neighboring nodes to push aside on impact
		WAVE_RADIUS = 3;
	
	// The world dimensions
	var world = { 
		width: 600, 
		height: 500,
		center: new Point( 300, 250 )
	};
		
	// Mouse input tracking
	var mouse = {
		// The current position
		x: 0,
		y: 0,
		
		// The position previous to the current
		previousX: 0,
		previousY: 0,
		
		// The velocity, based on the difference between
		// the current and next positions
		velocityX: 0,
		velocityY: 0,
		
		// Flags if the mouse is currently pressed down
		down: false,

		// When dragging the action is defined by the first nodes 
		// reaction (activate/deactivate)
		action: null,

		// A list of node ID's for which action should not be 
		// taken until the next time the mouse is pressed down
		exclude: []
		
	};
	
	var id = 0,

			container,

			canvas,
			context,

			clearButton,

			delta = 0,
			deltaTime = 0,
			activateNodeDistance = 0,

			pulseVelocity = 0.008,
			pulseQuantity = 3,

			// Seed is used to generate the note field so that random
			// one persons's grid can be saved & replicated
			// Some patterns to try:
			//		?8643+d+maj+8+30+43+55+66+69
			//		?8643+a+min+30+43+44+55+58+93+106+141
			seed = Math.floor( Math.random() * 10000 ),

			nodes = [],
			savedNodes = [],
			pulses = [];
	
	// Generate some scales (a, d & e)
	// Frequencies from http://www.seventhstring.com/resources/notefrequencies.html
	// Delta ratios are musical harmonies, like http://modularscale.com/
	var notes = {};
	notes.a = {
		min: [
			220.0,246.9,261.6,293.7,329.6,349.2,415.3,440.0,493.9,523.3
		],
		maj: [
			220.0,246.9,277.2,293.7,329.6,370.0,415.3,440.0,493.9,554.4
		]
	};

	var keys = [
		{ name: 'd', delta: 4/3 },
		{ name: 'e', delta: 3/2 }
	];

	keys.forEach(function (key) {
		notes[key.name] = {
			min: generateScaleFrom(notes.a.min, key.delta),
			maj: generateScaleFrom(notes.a.maj, key.delta)
		};
	});

	var currentKey = 'a', currentScale = 'maj';
	
	/**
	 * 
	 */
	function initialize() {
		// Run selectors and cache element references
		container = document.getElementById( 'wrapper' );
		canvas = document.querySelector( '#wrapper canvas' );
		clearButton = document.querySelector( '#wrapper .controls .clear' );
		keySelector = document.querySelector( '#wrapper .controls .key' );
		scaleSelector = document.querySelector( '#wrapper .controls .scale' );
		SaveButton = document.querySelector( '#wrapper .controls .save' );
		saveURLBox = document.querySelector('#wrapper .controls .url');
		
		if ( canvas && canvas.getContext ) {
			context = canvas.getContext('2d');
			context.globalCompositeOperation = 'lighter';

			// Populate the key selector
			for( var key in notes ) {
				if( notes.hasOwnProperty(key) ) {
					addKeyOption(key);
				}
			}

			// Restore grid from query string
			if( document.location.search.length > 0 ) {
				var queryString = document.location.search.slice(1,-1),
						query = queryString.split('+');

				if( query.length < 3 ) { return; }

				try {
					// Seed should be zeroth parameter
					seed = parseInt(query[0], 10);
					// First and second are key and scale
					if( notes.hasOwnProperty(query[1]) ){
						currentKey = query[1];
					}
					if( notes[currentKey].hasOwnProperty(query[2]) ){
						currentScale = query[2];
					}
					// Grab the rest of the query to activate the nodes
					var strNodes = query.slice(3);
					strNodes.forEach(function (nodeNum) {
						try {
							savedNodes.push(parseInt(nodeNum, 10));
						} catch(e) {}
					});
				} catch (e) {
					return;
				}
			}
			
			clearButton.addEventListener('click', onClearButtonClicked, false);
			SaveButton.addEventListener('click', onSaveButtonClicked, false);
			canvas.addEventListener('mousedown', onDocumentMouseDown, false);
			document.addEventListener('mousemove', onDocumentMouseMove, false);
			document.addEventListener('mouseup', onDocumentMouseUp, false);
			canvas.addEventListener('touchstart', onCanvasTouchStart, false);
			canvas.addEventListener('touchmove', onCanvasTouchMove, false);
			canvas.addEventListener('touchend', onCanvasTouchEnd, false);
			window.addEventListener('resize', onWindowResize, false);

			keySelector.addEventListener('change', onKeySelectorChanged, false);
			scaleSelector.addEventListener('change', onScaleSelectorChanged, false);

			keySelector.value = currentKey;
			scaleSelector.value = currentScale;
			
			// Force an initial layout
			onWindowResize();
			
			deltaTime = Date.now();

			setup();
			update();
		}
		else {
			alert( 'Doesn\'t seem like your browser supports the HTML5 canvas element :(' );
		}

	}

	function setup() {
		// Distance between nodes
		var cx = world.width / ( NODES_X + 1 ),
			cy = world.height / ( NODES_Y + 1 );

		activateNodeDistance = Math.min( cx, cy ) * 0.5;

		var i,
			j,
			x = 0,
			y = 0,
			len = NODES_X * NODES_Y,
			length;

		// Generate nodes
		for( y = 0; y < NODES_Y; y++ ) {
			for( x = 0; x < NODES_X; x++ ) {
				length = nodes.push( new Node( cx + x * cx, cy + y * cy, x, y ) );
				nodeNum = y * NODES_X + x;
				if( savedNodes.indexOf(nodeNum) !== -1 ) {
					nodes[length - 1].activate();
				}
			}
		}

		for( i = 0; i < len; i++ ) {
			var nodeA = nodes[i];

			for( j = 0; j < len; j++ ) {
				var nodeB = nodes[j];

				if( nodeA !== nodeB && nodeB.distanceToNode( nodeA ) < WAVE_RADIUS ) {
					nodeA.neighbors.push( nodeB );
				}
			}
		}

		// Add new pulses when needed
		for( var i = 0; i < PULSE_QUANTITY; i++ ) {
			pulses.push( new Pulse( 
				world.center.x,
				world.center.y,
				i * -( 1 / PULSE_QUANTITY ) // strength
			) );
		}
	}
	
	function update() {
		delta = 1 + ( 1 - Math.min( ( Date.now() - deltaTime ) / ( 1000 / 60 ), 1 ) );
		
		deltaTime = Date.now();

		clear();
		step();
		render();

		requestAnimFrame( update );
	}
	
	function clear() {
		context.clearRect( 0, 0, world.width, world.height );
	}

	function step() {
		var i, j, k;

		// Active nodes that the mouse touches when pressed down
		if( mouse.down ) {
			for( i = 0, len = nodes.length; i < len; i++ ) {
				var node = nodes[i];

				if( node.distanceTo( mouse.x, mouse.y ) < activateNodeDistance && mouse.exclude.indexOf( node.id ) === -1 ) {
					if( mouse.action !== 'deactivate' && node.active === false ) {
						mouse.action = 'activate';
						node.activate();

						container.className = '';
					}
					else if( mouse.action !== 'activate' && node.active === true ) {
						mouse.action = 'deactivate';
						node.deactivate();
					}

					mouse.exclude.push( node.id );
				}
			}
		}

		for( i = 0; i < nodes.length; i++ ) {
			var node = nodes[i];

			node.strength = Math.max( node.strength - ( 0.01 * delta ), 0 );
			node.size += ( node.sizeTarget - node.size ) * 0.25;

			node.offsetTargetX *= 0.6;
			node.offsetTargetY *= 0.6;

			node.offsetX += ( node.offsetTargetX - node.offsetX ) * 0.2;
			node.offsetY += ( node.offsetTargetY - node.offsetY ) * 0.2;

			if( node.strength > 0.1 ) {
				for( j = 0, jlen = node.neighbors.length; j < jlen; j++ ) {
					var neighbor = node.neighbors[j];

					var radians = Math.atan2( node.indexh - neighbor.indexh, node.indexv - neighbor.indexv ),
						distance = node.distanceToNode( neighbor );

					neighbor.offsetX += Math.sin( radians - Math.PI ) * node.strength * ( WAVE_RADIUS - distance );
					neighbor.offsetY += Math.cos( radians - Math.PI ) * node.strength * ( WAVE_RADIUS - distance );
				}
			}
		}

		for( i = 0; i < pulses.length; i++ ) {
			var pulse = pulses[i];

			pulse.strength += PULSE_VELOCITY;

			// Remove used up pulses
			if( pulse.strength > 1 ) {
				pulse.reset();
			}
			else {
				// Check for collision with nodes
				for( j = 0, len = nodes.length; j < len; j++ ) {
					var node = nodes[j];

					// Distance between the pulse wave and node
					var distance = Math.abs( node.distanceTo( pulse.x, pulse.y ) - ( pulse.size * pulse.strength ) );

					if( node.active && node.collisionIndex < pulse.index && distance < ACTIVATION_DISTANCE ) {
						node.collisionIndex = pulse.index;
						node.play();
						node.highlight( 100 );
					}
					// Causes a slight effect in all inactive dots
					else if( !node.active && distance < ACTIVATION_DISTANCE ) {
						// node.strength = 0.15;
					}
				}
			}
		}
	}
	
	function render() {
		// Render nodes
		for( var i = 0, len = nodes.length; i < len; i++ ) {
			var node = nodes[i];

			// Angle and distance between node and center
			var radians = Math.atan2( world.center.y - node.y, world.center.x - node.x ),
				distance = node.distanceTo( world.center.x, world.center.y );

			var distanceFactor = distance / Math.min( world.width, world.height );

			// Offset for the pin head
			var ox = node.offsetX + Math.cos( radians - Math.PI ) * ( 30 * distanceFactor ) * node.strength,
				oy = node.offsetY + Math.sin( radians - Math.PI ) * ( 30 * distanceFactor ) * node.strength;

			if( node.strength ) {
				var radius = 4 + node.size * 20 * node.strength;
				
				context.beginPath();
				context.arc( node.x, node.y, radius, 0, Math.PI * 2, true );

				var gradient = context.createRadialGradient( node.x, node.y, 0, node.x, node.y, radius );
				gradient.addColorStop( 0, node.activeColorA );
				gradient.addColorStop( 1, node.activeColorB );

				context.fillStyle = gradient;
				context.fill();
			}

			// Offset for the pin body
			var tx = Math.cos( radians ) * ( 30 * distanceFactor ),
				ty = Math.sin( radians ) * ( 30 * distanceFactor );

			// Pin body
			context.beginPath();
			context.moveTo( node.x + ox, node.y + oy );
			context.lineTo( node.x + tx, node.y + ty );
			context.lineWidth = 1;
			context.strokeStyle = 'rgba(255,255,255,0.2)';
			context.stroke();

			// Pin head
			context.beginPath();
			context.arc( node.x + ox, node.y + oy, node.size, 0, Math.PI * 2, true );
			context.fillStyle = node.color;
			context.fill();
		}

		// Render pulses
		for( var i = 0, len = pulses.length; i < len; i++ ) {
			var pulse = pulses[i];

			if( pulse.strength > 0 ) {
				context.beginPath();
				context.arc( pulse.x, pulse.y, Math.max( (pulse.size * pulse.strength)-2, 0 ), 0, Math.PI * 2, true );
				context.lineWidth = 8;
				context.strokeStyle = 'rgba(90,255,180,'+ ( 0.2 * ( 1 - pulse.strength ) ) +')';
				context.stroke();

				context.beginPath();
				context.arc( pulse.x, pulse.y, pulse.size * pulse.strength, 0, Math.PI * 2, true );
				context.lineWidth = 2;
				context.strokeStyle = 'rgba(90,255,180,'+ ( 0.8 * ( 1 - pulse.strength ) ) +')';
				context.stroke();
			}
		}
	}

	function addKeyOption(key) {
		var option = document.createElement('option');
		option.textContent = key;
		keySelector.appendChild(option);
	}

	function generateScaleFrom(originalScale, delta) {
		var newScale = [];
		originalScale.forEach(function (freq) {
			newScale.push(freq * delta);
		});
		return newScale;
	}

	function onClearButtonClicked( event ) {
		for( var i = 0, len = nodes.length; i < len; i++ ) {
			nodes[i].deactivate();
		}
	}

	function onSaveButtonClicked( event ) {
		var saveData = [seed, currentKey, currentScale];
		nodes.forEach(function (node, index) {
			if( node.active ) {
				saveData.push(index);
			}
		});
		var url = document.location.protocol + '//' + document.location.host + '/?' + saveData.join('+');
		history.pushState(null, null, url);
		saveURLBox.value = url;
		saveURLBox.className += ' show';
	}
	
	function onDocumentMouseDown( event ) {
		mouse.down = true;
		mouse.action = null;
		mouse.exclude.length = 0;
	}
	
	function onDocumentMouseMove( event ) {
		mouse.previousX = mouse.x;
		mouse.previousY = mouse.y;
		
		mouse.x = event.clientX - (window.innerWidth - world.width) * 0.5;
		mouse.y = event.clientY - (window.innerHeight - world.height) * 0.5;
		
		mouse.velocityX = Math.abs( mouse.x - mouse.previousX ) / world.width;
		mouse.velocityY = Math.abs( mouse.y - mouse.previousY ) / world.height;
	}
	
	function onDocumentMouseUp( event ) {
		mouse.down = false;
	}
	
	function onCanvasTouchStart( event ) {
		if(event.touches.length == 1) {
			event.preventDefault();
			
			mouse.x = event.touches[0].pageX - (window.innerWidth - world.width) * 0.5;
			mouse.y = event.touches[0].pageY - (window.innerHeight - world.height) * 0.5;
			
			mouse.down = true;
			mouse.action = null;
			mouse.exclude.length = 0;
		}
	}
	
	function onCanvasTouchMove( event ) {
		if(event.touches.length == 1) {
			event.preventDefault();

			mouse.x = event.touches[0].pageX - (window.innerWidth - world.width) * 0.5;
			mouse.y = event.touches[0].pageY - (window.innerHeight - world.height) * 0.5 - 20;
		}
	}
	
	function onCanvasTouchEnd( event ) {
		mouse.down = false;
	}
	
	function onWindowResize() {
		// Resize the container
		container.style.width = world.width + 'px';
		container.style.height = world.height + 'px';
		container.style.left = ( window.innerWidth - world.width ) / 2 + 'px';
		container.style.top = ( window.innerHeight - world.height ) / 2 + 'px';
		
		// Resize the canvas
		canvas.width = world.width;
		canvas.height = world.height;
	}

	function onKeySelectorChanged( event ) {
		// Change the current key
		var newKey = keySelector.value;

		if( notes.hasOwnProperty(newKey) ) {
			currentKey = newKey;
		} else {
			keySelector.value = currentKey;
		}
	}

	function onScaleSelectorChanged( event ) {
		// Change the current scale
		var newScale = scaleSelector.value;

		if( notes[currentKey].hasOwnProperty(newScale) ) {
			currentScale = newScale;
		} else {
			scaleSelector.value = currentScale;
		}
	}

	/**
	 * Represets one node/point in the grid.
	 */
	function Node( x, y, indexh, indexv ) {
		// invoke super
		this.constructor.apply( this, arguments );

		this.indexh = indexh;
		this.indexv = indexv;

		this.id = ++id;
		this.neighbors = [];
		this.collisionIndex = 0;
		this.active = false;
		this.strength = 0;
		this.size = 1;
		this.sizeTarget = this.size;
			
		// This bit of randomness should make sure that the notes are different
		// and unpredictable, yet reproducably so when the same seed is used.
		// indexv * NODES_X + indexh reproduces the overall node number,
		// this * seed % the number of notes in the current scale in the key of A
		// produces something reproducable with the same seed, although there's still
		// a degree of linearity becuase of the modulus: notes rise from right to left
		// with a repeating patter top to bottom.
		this.note = seed * (indexv * NODES_X + indexh) % notes.a[currentScale].length;

		this.offsetX = 0;
		this.offsetY = 0;

		this.offsetTargetX = 0;
		this.offsetTargetY = 0;

		this.color = '#fff';
		this.activeColorA = 'rgba(90,255,230,0.2)';
		this.activeColorB = 'rgba(90,255,230,0.0)';
	}
	Node.prototype = new Point();
	Node.prototype.generate = function() {
		this.audiolet = new Audiolet( 44100, 2 );
		
		var factorY = 1 - ( this.y / world.height ),
				factorD = this.distanceTo( world.center.x, world.center.y );
			
		this.frequency = notes[currentKey][currentScale][this.note];

		this.attack = 0.02;
		this.release = 0.8;
	};
	Node.prototype.distanceToNode = function( node ) {
		var dx = node.indexh - this.indexh;
		var dy = node.indexv - this.indexv;

		return Math.sqrt(dx*dx + dy*dy);
	};
	Node.prototype.activate = function() {
		this.active = true;
		this.sizeTarget = 5;
		this.color = 'rgba(110,255,210,0.8)';
	};
	Node.prototype.deactivate = function() {
		this.active = false;
		this.sizeTarget = 1;
		this.color = '#fff';
	};
	Node.prototype.play = function() {
		if( !this.audiolet ) {
			this.generate();
		}

		this.frequency = notes[currentKey][currentScale][this.note];

		this.synth = new Synth( this.audiolet, this.frequency, this.attack, this.release );
		this.synth.connect( this.audiolet.output );
	};
	Node.prototype.highlight = function( delay ) {
		if( delay ) {
			setTimeout( function() {
				
				this.strength = 1;

			}.bind( this ), delay );
		}
		else {
			this.strength = 1;
		}
	};

	/**
	 * Represents a pulsewave that triggers nodes.
	 */
	function Pulse( x, y, strength ) {
		// invoke super
		this.constructor.apply( this, arguments );

		this.index = ++id;
		this.size = Math.max( world.width, world.height ) * 0.65;
		this.strength = strength || 0;
	}
	Pulse.prototype = new Point();
	Pulse.prototype.reset = function() {
		this.index = ++id;
		this.strength = 0;
	}

	/**
	 * Plays a short sound effect based on arguments.
	 */
	function Synth( audiolet, frequency, attack, release ) {
		AudioletGroup.apply(this, [audiolet, 0, 1]);
		// Basic wave
		this.sine = new Sine(audiolet, frequency);
		
		// Gain envelope
		this.gain = new Gain(audiolet);
		this.env = new PercussiveEnvelope(audiolet, 1, attack, release,
			function() {
				this.audiolet.scheduler.addRelative(0, this.remove.bind(this));
			}.bind(this)
		);
		this.envMulAdd = new MulAdd(audiolet, 0.2, 0);

		// Main signal path
		this.sine.connect(this.gain);
		this.gain.connect(this.outputs[0]);

		// Envelope
		this.env.connect(this.envMulAdd);
		this.envMulAdd.connect(this.gain, 0, 1);
	}; 
	Synth.prototype = new AudioletGroup();
	
	initialize();
	
})();
