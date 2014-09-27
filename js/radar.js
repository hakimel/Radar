
/**
 * @author Hakim El Hattab
 */
var Radar = (function(){

	var NODES_X = 12,
		NODES_Y = 12,

		BEAT_VELOCITY = 0.01,
		BEAT_FREQUENCY = 2,
		BEAT_LIMIT = 10,

		// Distance threshold between active node and beat
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

		sidebar,
		sequencer,
		sequencerInput,
		sequencerInputElements,
		sequencerAddButton,

		saveButton,
		resetButton,

		query = {},

		currentBeat = null,
		defaultBeats = [
			[ 'a', 'min' ],
			[ 'a', 'min' ]
		],

		activateNodeDistance = 0,

		// Seed is used to generate the note field so that random
		// one persons's grid can be saved & replicated
		// Some patterns to try:
		//		?8643+d+maj+8+30+43+55+66+69
		//		?8643+a+min+30+43+44+55+58+93+106+141
		seed = Math.floor( Math.random() * 10000 ),

		nodes = [],
		savedNodes = [],
		beats = [];

	// Generate some scales (a, d & e)
	// Frequencies from http://www.seventhstring.com/resources/notefrequencies.html
	// Delta ratios are musical harmonies, like http://modularscale.com/
	var notes = {};
	notes.a = {
		min: [ 220.0,246.9,261.6,293.7,329.6,349.2,415.3,440.0,493.9,523.3 ],
		maj: [ 220.0,246.9,277.2,293.7,329.6,370.0,415.3,440.0,493.9,554.4 ],
		minColor: 'hsl(180, 90%, 50%)',
		majColor: 'hsl(160, 90%, 50%)'
	};

	notes.d = {
		min: generateScaleFrom( notes.a.min, 4/3 ),
		maj: generateScaleFrom( notes.a.maj, 4/3 ),
		minColor: 'hsl(140, 90%, 50%)',
		majColor: 'hsl(120, 90%, 50%)'
	};

	notes.e = {
		min: generateScaleFrom( notes.a.min, 3/2 ),
		maj: generateScaleFrom( notes.a.maj, 3/2 ),
		minColor: 'hsl(100, 90%, 50%)',
		majColor: 'hsl(80, 90%, 50%)'
	};

	/**
	 *
	 */
	function initialize() {
		// Run selectors and cache element references
		container = document.getElementById( 'wrapper' );
		canvas = document.querySelector( '#wrapper canvas' );
		sidebar = document.querySelector( '#wrapper .sidebar' );
		resetButton = document.querySelector( '#wrapper .sidebar .reset' );
		saveButton = document.querySelector( '#wrapper .sidebar .save' );
		sequencer = document.querySelector( '#wrapper .sequencer' );
		sequencerInput = document.querySelector( '#wrapper .sequencer-input' );
		sequencerInputElements = sequencerInput.querySelectorAll( 'li' );
		sequencerAddButton = document.querySelector( '#wrapper .sequencer .add-key' );

		if ( canvas && canvas.getContext ) {
			context = canvas.getContext('2d');
			context.globalCompositeOperation = 'lighter';

			// Split the query values into a key/value object
			location.search.replace( /[A-Z0-9]+?=([\w|\-|\+]*)/gi, function(a) {
				query[ a.split( '=' ).shift() ] = a.split( '=' ).pop();
			} );

			if( query.seed ) {
				seed = parseInt( query.seed );
			}

			addEventListeners();

			// Force an initial layout
			onWindowResize();

			setup();
			load();
			update();
		}
		else {
			alert( 'Doesn\'t seem like your browser supports the HTML5 canvas element :(' );
		}

	}

	function addEventListeners() {
		resetButton.addEventListener('click', onResetButtonClicked, false);
		saveButton.addEventListener('click', onSaveButtonClicked, false);
		sequencerAddButton.addEventListener('click', onSequencerAddButtonClick, false);

		canvas.addEventListener('mousedown', onCanvasMouseDown, false);
		document.addEventListener('mousemove', onDocumentMouseMove, false);
		document.addEventListener('mouseup', onDocumentMouseUp, false);
		canvas.addEventListener('touchstart', onCanvasTouchStart, false);
		canvas.addEventListener('touchmove', onCanvasTouchMove, false);
		canvas.addEventListener('touchend', onCanvasTouchEnd, false);
		window.addEventListener('resize', onWindowResize, false);

		for( var i = 0, len = sequencerInputElements.length; i < len; i++ ) {
			sequencerInputElements[i].addEventListener( 'click', onSequencerInputElementClick, false );
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
				nodes.push( new Node( cx + x * cx, cy + y * cy, x, y ) );
			}
		}

		// Determine node neighbors
		for( i = 0; i < len; i++ ) {
			var nodeA = nodes[i];

			for( j = 0; j < len; j++ ) {
				var nodeB = nodes[j];

				if( nodeA !== nodeB && nodeB.distanceToNode( nodeA ) < WAVE_RADIUS ) {
					nodeA.neighbors.push( nodeB );
				}
			}
		}
	}

	function load() {
		// Restore grid from query string
		if( document.location.search.length > 0 ) {
			var isRunning = false;

			if( query.beats ) {
				var beatData = query.beats.split( '+' );

				for( var i = 0, len = beatData.length; i < len; i++ ) {
					var key = beatData[i].split( '-' )[0],
						scale = beatData[i].split( '-' )[1];

					addBeat( key, scale );

					isRunning = true;
				}
			}

			if( query.nodes ) {
				var nodeData = query.nodes.split( '+' );

				for( var i = 0, len = nodeData.length; i < len; i++ ) {
					var index = parseInt( nodeData[i], 10 );

					if( nodes[ index ] ) {
						nodes[ index ].activate();
						isRunning = true;
					}
				}
			}

			if( isRunning ) {
				container.className = container.className.replace( 'empty', '' );
			}
		}
		else {
			for( var i = 0, len = defaultBeats.length; i < len; i++ ) {
				addBeat( defaultBeats[i][0], defaultBeats[i][1] );
			}
		}
	}

	function reset() {
		var i;

		for( i = 0, len = nodes.length; i < len; i++ ) {
			nodes[i].deactivate();
		}

		while( beats.length ) {
			beats.pop().destroy();
		}

		for( i = 0, len = defaultBeats.length; i < len; i++ ) {
			addBeat( defaultBeats[i][0], defaultBeats[i][1] );
		}

		currentBeat = null;
	}

	function addBeat() {
		var element;

		if( arguments.length === 2 ) {
			element = document.createElement( 'li' );
			element.setAttribute( 'data-key', arguments[0] );
			element.setAttribute( 'data-scale', arguments[1] );
			sequencer.insertBefore( element, sequencerAddButton );
		}
		else {
			element = arguments[0];
		}

		var elementKey = element.getAttribute( 'data-key' ),
			elementScale = element.getAttribute( 'data-scale' );

		var beat = new Beat(
			world.center.x,
			world.center.y,
			element,
			elementKey,
			elementScale,
			beats.length
		);

		beats.push( beat );

		updateBeats();

		return beat;
	}

	function removeBeat( index ) {
		var beat = beats[ index ];

		if( beat ) {
			if( beat === currentBeat ) {
				currentBeat = null;
			}

			beats.splice( beat.index, 1 );
			beat.destroy();
		}

		updateBeats();
	}

	function updateBeats() {
		if( beats.length > BEAT_LIMIT - 1 ) {
			sequencerAddButton.style.visibility = 'hidden';
		}
		else {
			sequencerAddButton.style.visibility = 'visible';
		}

		// Update indices of all beats
		for( var i = 0, len = beats.length; i < len; i++ ) {
			beats[i].changeIndex( i );
		};
	}

	function update() {
		clear();
		render();

		requestAnimFrame( update );
	}

	function clear() {
		context.clearRect( 0, 0, world.width, world.height );
	}

	function render() {
		// Render nodes
		for( var i = 0, len = nodes.length; i < len; i++ ) {
			var node = nodes[i];

			updateNode( node );
			renderNode( node );
		}

		// Render beats
		context.save();

		var activeBeats = 0,
			firstActiveBeatStrength = 0;

		for( var i = 0, len = beats.length; i < len; i++ ) {
			var beat = beats[i];

			updateBeat( beat );
			renderBeat( beat );

			if( beat.active ) {
				activeBeats += 1;

				if( firstActiveBeatStrength === 0 ) {
					firstActiveBeatStrength = beat.strength;
				}
			}
		}

		context.restore();

		// Trigger a new beat when needed
		if( beats.length ) {
			var nextBeat = currentBeat ? beats[ ( currentBeat.index + 1 ) % beats.length ] : null;

			if( !currentBeat ) {
				currentBeat = beats[0];
				currentBeat.activate();
			}
			else if( !nextBeat.active && activeBeats < BEAT_FREQUENCY && currentBeat.strength > 1 / BEAT_FREQUENCY ) {
				currentBeat = nextBeat;
				currentBeat.activate();
			}
		}
	}

	function updateNode( node ) {
		// Active nodes that the mouse touches when pressed down
		if( mouse.down ) {
			if( node.distanceTo( mouse.x, mouse.y ) < activateNodeDistance && mouse.exclude.indexOf( node.id ) === -1 ) {
				if( mouse.action !== 'deactivate' && node.active === false ) {
					mouse.action = 'activate';
					node.activate();

					container.className = container.className.replace( 'empty', '' );
				}
				else if( mouse.action !== 'activate' && node.active === true ) {
					mouse.action = 'deactivate';
					node.deactivate();
				}

				mouse.exclude.push( node.id );
			}
		}

		node.strength = Math.max( node.strength - 0.01, 0 );
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

	function renderNode( node ) {
		// Angle and distance between node and center
		var radians = Math.atan2( world.center.y - node.y, world.center.x - node.x ),
			distance = node.distanceTo( world.center.x, world.center.y );

		var distanceFactor = distance / Math.min( world.width, world.height );

		// Offset for the pin head
		var ox = node.offsetX + Math.cos( radians - Math.PI ) * ( 30 * distanceFactor ) * node.strength,
			oy = node.offsetY + Math.sin( radians - Math.PI ) * ( 30 * distanceFactor ) * node.strength;

		if( node.strength ) {
			var radius = 4 + node.size * 16 * node.strength;

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

	function updateBeat( beat ) {
		if( beat.active ) {
			beat.strength += BEAT_VELOCITY;
		}

		// Remove used up beats
		if( beat.strength > 1 ) {
			beat.deactivate();
		}
		else if( beat.active ) {
			// Check for collision with nodes
			for( var j = 0, len = nodes.length; j < len; j++ ) {
				var node = nodes[j];

				if( node.active && node.collisionLevel < beat.level ) {
					// Distance between the beat wave and node
					var distance = Math.abs( node.distanceTo( beat.x, beat.y ) - ( beat.size * beat.strength ) );

					if( distance < ACTIVATION_DISTANCE ) {
						node.collisionLevel = beat.level;
						node.play( beat.key, beat.scale );
						node.highlight( 100 );
					}
				}
			}
		}
	}

	function renderBeat( beat ) {
		if( beat.active && beat.strength > 0 ) {
			context.beginPath();
			context.arc( beat.x, beat.y, Math.max( (beat.size * beat.strength)-2, 0 ), 0, Math.PI * 2, true );
			context.lineWidth = 8;
			context.globalAlpha = 0.2 * ( 1 - beat.strength );
			context.strokeStyle = beat.color;
			context.stroke();

			context.beginPath();
			context.arc( beat.x, beat.y, beat.size * beat.strength, 0, Math.PI * 2, true );
			context.lineWidth = 2;
			context.globalAlpha = 0.8 * ( 1 - beat.strength );
			context.strokeStyle = beat.color;
			context.stroke();
		}
	}

	function generateScaleFrom(originalScale, delta) {
		var newScale = [];
		originalScale.forEach(function (freq) {
			newScale.push(freq * delta);
		});
		return newScale;
	}

	function onResetButtonClicked( event ) {
		reset();
	}

	function onSaveButtonClicked( event ) {
		var data = {
			seed: seed,
			beats: [],
			nodes: []
		};

		nodes.forEach(function ( node, index ) {
			if( node.active ) {
				data.nodes.push( index );
			}
		});

		beats.forEach(function ( beat, index ) {
			data.beats.push( beat.key + '-' + beat.scale );
		});

		var query = '',
			value;

		for( var i in data ) {
			value = data[i] instanceof Array ? data[i].join( '+' ) : data[i];
			query += ( query.length > 0 ? '&' : '' ) + ( i + '=' + value );
		}

		var url = document.location.protocol + '//' + document.location.host + document.location.pathname + '?' + query;

		if( 'history' in window && 'pushState' in window.history ) {
			window.history.pushState( null, null, url );
		}

		prompt( 'Copy the unique URL and save it or share with friends.', url );
	}

	function onSequencerAddButtonClick( event ) {
		var lastBeat = beats[ beats.length - 1 ];

		if( lastBeat ) {
			addBeat( lastBeat.key, lastBeat.scale ).openSelector();
		}
		else {
			addBeat( 'a', 'min' ).openSelector();
		}
	}

	function onSequencerInputElementClick( event ) {
		sequencerInput.style.visibility = 'hidden';

		var element = event.target;

		if( element ) {
			event.preventDefault();

			var index = parseInt( sequencerInput.getAttribute( 'data-index' ) ),
				key = element.getAttribute( 'data-key' ),
				scale = element.getAttribute( 'data-scale' );

			if( !isNaN( index ) && key && scale ) {
				var beat = beats[ index ];

				if( beat ) {
					beat.generate( key, scale );
				}
			}
		}
	}

	function onCanvasMouseDown( event ) {
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
		sequencerInput.style.visibility = 'hidden';
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
		var containerWidth = world.width + sidebar.offsetWidth + 20;

		// Resize the container
		container.style.width = containerWidth + 'px';
		container.style.height = world.height + 'px';
		container.style.left = ( window.innerWidth - world.width ) / 2 + 'px';
		container.style.top = ( window.innerHeight - world.height ) / 2 + 'px';

		// Resize the canvas
		canvas.width = world.width;
		canvas.height = world.height;
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
		this.collisionLevel = 0;
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
		this.note = seed * (indexv * NODES_X + indexh) % notes.a[ 'maj' ].length;

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

		this.attack = 0.01;
		this.release = 0.6;
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
	Node.prototype.play = function( key, scale ) {
		if( !this.audiolet ) {
			this.generate();
		}

		this.frequency = notes[ key ][ scale ][ this.note ];

		// This is horribly bad for performance and memory.. Need
		// to find a way to cache
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
	 * Represents a beatwave that triggers nodes.
	 */
	function Beat( x, y, element, key, scale, index ) {
		// invoke super
		this.constructor.apply( this, arguments );

		this.element = element;

		this.changeIndex( index );
		this.generate( key, scale );

		this.level = ++id;
		this.size = Math.max( world.width, world.height ) * 0.65;
		this.active = false;
		this.strength = 0;

		this.openSelector = this.openSelector.bind( this );

		this.element.addEventListener( 'click', this.openSelector, false );
	};
	Beat.prototype = new Point();
	Beat.prototype.changeIndex = function( index ) {
		this.index = index;
		this.element.setAttribute( 'data-index', this.index );
	};
	Beat.prototype.generate = function( key, scale ) {
		this.key = key;
		this.scale = scale;

		this.color = notes[ this.key ][ scale + 'Color' ];

		this.element.innerHTML = '';

		this.backgroundElement = document.createElement( 'div' );
		this.backgroundElement.className = 'background';
		this.backgroundElement.style.backgroundColor = this.color;
		this.element.appendChild( this.backgroundElement );

		this.element.setAttribute( 'data-key', this.key );
		this.element.setAttribute( 'data-scale', this.scale );
		this.element.innerHTML += key.toUpperCase() + ' ' + scale + 'or';

		this.deleteElement = document.createElement( 'span' );
		this.deleteElement.innerHTML = '&times;';
		this.deleteElement.className = 'delete';
		this.element.appendChild( this.deleteElement );

		this.deleteElement.addEventListener( 'click', function() {
			removeBeat( this.index );
			return false;
		}.bind( this ), false );
	};
	Beat.prototype.activate = function() {
		this.level = ++id;
		this.active = true;
		this.strength = 0;

		// For some reason this.backgroundElement isn't reacting
		var background = this.element.querySelector( '.background' );

		background.className = 'background instant';
		background.style.opacity = 0.4;

		setTimeout( function() {
			background.className = 'background';
			background.style.opacity = 0;
		}, 1 );
	};
	Beat.prototype.deactivate = function() {
		this.active = false;
	};
	Beat.prototype.destroy = function() {
		if( this.element && this.element.parentElement ) {
			this.element.removeEventListener( 'click', this.openSelector, false );
			this.element.parentElement.removeChild( this.element );
			this.element = null;
		}
	};
	Beat.prototype.openSelector = function( event ) {
		// If the user clicks on the same beat twice, hide the input
		if( sequencerInput.style.visibility === 'visible' && parseInt( sequencerInput.getAttribute( 'data-index' ) ) === this.index ) {
			sequencerInput.style.visibility = 'hidden';
		}
		else {
			sequencerInput.style.visibility = 'visible';
			sequencerInput.style.left = -sequencerInput.offsetWidth - 15 + 'px';
			sequencerInput.style.top = this.element.offsetTop + ( ( this.element.offsetHeight - sequencerInput.offsetHeight ) / 2 ) + 'px';
			sequencerInput.setAttribute( 'data-index', this.index );
		}
	};

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
