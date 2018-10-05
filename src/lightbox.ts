module Carbon {
  function setStyle(element: HTMLElement, data: any) {
    for (var key of Object.keys(data)) {
      element.style[key] = data[key];
    }
  }
  
  export class Lightbox {
    static instance: Lightbox;

    static get() : Lightbox {
      // Lazily create an instance the first time it's used
      return Lightbox.instance || (Lightbox.instance = new Lightbox());
    }

    element: HTMLElement;

    scrollTop: number;

    viewport: Viewport;
    padding = 25;

    url: string;
    fullHeight: number;
    fullWidth: number;
    scale: number;
    origin: ClientRect;
        
    fittedBox: Box;

    sourceElement: HTMLElement;
    cloneEl: HTMLElement;
    
    queuedOpen = false;
    visible = false;
    animating = false;
    
    timestamp: number;
    pannable: Pannable;
        
    animationDuration = 200;
    state = 'closed';

    easing = 'cubic-bezier(.175,.885,.32,1)';

    constructor() {
      this.element = this.createElement();

      this.viewport = new Viewport(this.element.querySelector('.viewport'));
      
      window.addEventListener('scroll', this.onScroll.bind(this), false);

      document.addEventListener('keyup', e => {
        if (e.keyCode !== 27) return; // escape        

        if (this.pannable && this.pannable.enabled) {
          this.pannable.reset();
          this.pannable.disable();
        }
        else {
          this.zoomOut();
        }
      });
      
      this.viewport.element.addEventListener('click', this.onTap.bind(this), true);

      this.viewport.on('panstart', this.onPanStart.bind(this));
      this.viewport.on('panmove', this.onPanMove.bind(this));
      this.viewport.on('panend', this.onPanEnd.bind(this));
    }

    open(sourceElement: HTMLElement) {
      this.scrollTop = document.body.scrollTop;

      if(this.visible || this.queuedOpen) return;

      this.sourceElement = sourceElement;

      if (this.animating) return;

      this.origin = this.sourceElement.getBoundingClientRect();

      this.scale = 0;

      var data = sourceElement.dataset;

      this.url = data['zoomSrc'];

      if (data['zoomSize']) {
        var parts = data['zoomSize'].split('x');
        
        this.fullWidth = parseInt(parts[0], 10);
        this.fullHeight = parseInt(parts[1], 10);
      }
      else {
        this.fullWidth  = parseInt(data['zoomWidth'], 10);
        this.fullHeight = parseInt(data['zoomHeight'], 10);
      }

      this.createClone();

      this.visible = true;

      this.element.classList.add('open');
      this.element.classList.remove('closed');
      this.element.style.visibility = 'visible';
      this.element.style.cursor = 'zoom-out';

      _.trigger(this.element, 'lightbox:open', { });            
      this.pannable = new Carbon.Pannable(this.cloneEl, this.viewport);

      this.sourceElement.style.visibility = 'hidden';
      
      this.cloneEl.style['will-change'] = 'transform';

      this.zoomIn();
    }

    onPanEnd(e) {
      this.cloneEl.style.transition = null;
      
      if (this.pannable.enabled || this.pannable.dragging) return;

      if (Math.abs(e.deltaY) > 50) {

        this.animating = true;

        this.viewport.element.style.transition = `transform 50ms ${this.easing}`;

        this.viewport.element.style.transform = `translateY(0px)`;

        setTimeout(() => {
          this.zoomOut();
        }, 50);

      }
      else {
        this.element.style.transform = null;
      }
    }

    onPanStart(e) {
      if (this.pannable.enabled) return;
    
      this.fitObject();
    }

    onPanMove(e) {
      if (this.pannable.enabled) return;
                
      this.viewport.element.style.transition = '';
      
      this.viewport.element.style.transform = `translateY(${e.deltaY}px`;
    }

    onTap(e) {
      if (this.animating || this.pannable.dragging) 
      {
        return;
      }

      if (!this.cloneEl.classList.contains('pannable')) {
        this.zoomOut();

        return;
      }
    
      if (this.pannable.enabled) {
        this.pannable.content._scale = 1;        
        this.cloneEl.style.transition = `transform 250ms ${this.easing}`;
        this.cloneEl.style.transform = `scale(1) translate(${this.fittedBox.left}px, ${this.fittedBox.top}px)`;
        
        this.pannable.disable();
  
        this.state = 'opened';

        return;
      }

      this.state = 'panning';

      this.fitObject();

      this.calculateTargetPosition({ width: this.fullWidth, height: this.fullHeight });

      let l = e.offsetX - this.fittedBox.left + 25;
      let t = e.offsetY - this.fittedBox.top + 25;
  
      let anchor = { 
        x: (l / this.fittedBox.width), 
        y: (t / this.fittedBox.height)  
      };
      

      this.pannable.enable();

      this.cloneEl.style.objectFit = null;
      this.cloneEl.style.width = this.fittedBox.width + 'px';
      this.cloneEl.style.height = this.fittedBox.height + 'px';
      this.cloneEl.style.position = 'absolute';
      this.cloneEl.style.top = '0';
      this.cloneEl.style.left = '0';
      this.cloneEl.style.transition = null;

      this.cloneEl.style.transform = `scale(1) translate(${this.fittedBox.left}px, ${this.fittedBox.top}px)`;
      
      setTimeout(() => {
        this.cloneEl.style.transition = `transform 250ms ${this.easing}`;


        this.pannable.content._scale = this.fullWidth / this.fittedBox.width;

        this.pannable.viewport.centerAt(anchor);

      }, 15);
  
    }

    createClone() {
      let a = this.element.querySelector('.clone');
      
      a && a.remove();
      
      let cloneEl = this.sourceElement.cloneNode(true) as HTMLElement;

      // Safari scales up the original pixels of sub-elements
      // if it's a <carbon-image /> ... just scale up the <img />

      if (cloneEl.tagName == 'CARBON-IMAGE' && cloneEl.querySelector('img')) {
        cloneEl = cloneEl.querySelector('img');
      }

      cloneEl.removeAttribute('style');

      // position over the current element
      setStyle(cloneEl, {
        display: 'block',
        position: 'absolute',
        top: '0',
        left: '0',
        pointerEvents: 'none',
        width: this.origin.width  + 'px',
        height:  this.origin.height + 'px',
        transformOrigin: 'left top',
        transform: `translate(${this.origin.left}px, ${this.origin.top}px) scale(1)`
      });    

      cloneEl.draggable = false;
      
      cloneEl.classList.add('clone');
      cloneEl.classList.remove('zoomable');

      cloneEl.removeAttribute('on-click');
      
      this.viewport.element.appendChild(cloneEl);

      this.calculateTargetPosition({ width: this.fullWidth, height: this.fullHeight });

      this.cloneEl = cloneEl;
    }

    resetCloneStyle() {
      setStyle(this.cloneEl, {
        display: 'block',
        position: 'absolute',
        top: '0',
        left: '0',
        pointerEvents: 'none',
        width: this.origin.width  + 'px',
        height:  this.origin.height + 'px',
        transformOrigin: 'left top'
      });

      this.calculateTargetPosition({ width: this.fullWidth, height: this.fullHeight });

      // Scale the cloned element
      // this.cloneEl.style.transition = 'none';       
      this.cloneEl.style.transform = `translate(${this.fittedBox.left}px,${this.fittedBox.top}px) scale(${this.scale})`;

    }

    calculateTargetPosition(elementSize: Size) {
      this.origin = this.sourceElement.getBoundingClientRect();

      let size = this.fit(
        elementSize, 
        { 
          width: this.viewport.innerWidth,
          height: this.viewport.innerHeight 
        }
      );

      this.fittedBox = {
        width  : size.width,
        height : size.height,
        top    : (this.height - size.height) / 2,
        left   : (this.width - size.width) / 2
      };

      if (elementSize.top) {
        this.fittedBox.top = elementSize.top;
      }

      if (elementSize.left) {
        this.fittedBox.left = elementSize.left;
      }

      this.scale = this.fittedBox.width / this.origin.width;
    }

    onScroll() {
      if (!this.sourceElement) return;

      if (this.animating) {
        this.calculateTargetPosition({ width: this.fullWidth, height: this.fullHeight });

        let elapsed = new Date() - this.animationStart;

        this.cloneEl.style.transition = `transform ${this.animationDuration - elapsed}ms ease-out`;
        this.cloneEl.style.transform = `translate(${this.origin.left}px,${this.origin.top}px) scale(${this.origin.width / this.cloneEl.clientWidth})`;
      }
      
      if (this.visible && Math.abs(this.scrollTop - window.scrollY) > 15) {
        this.zoomOut();
      }
    }

    zoomIn(duration = '0.25s') {
      this.viewport.element.style.transform = null;

      let animated = new Deferred<boolean>();

      this.state = 'opening';
      
      // this.cloneEl.addEventListener('transitionend', this.zoomInCompleted, false);

      this.cloneEl.style.transition = `transform ${duration} ${this.easing}`;       
      this.cloneEl.style.transform = `translate(${this.fittedBox.left}px,${this.fittedBox.top}px) scale(${this.scale})`;

      let otherImg : HTMLImageElement = this.cloneEl.tagName == 'IMG' 
        ? this.cloneEl as HTMLImageElement
        : this.cloneEl.querySelector('img');

        
      if (otherImg) {
        let img = new Image();

        img.onload = () => {
          animated.promise.then(() => {          
            // otherImg.removeAttribute('srcset');

            setTimeout(() => {

              console.log('better image', this.state);

              if (!(this.state == 'opening' || this.state == 'opened')) {
                 return;
              }

              otherImg.srcset = this.url + ' 1x';

              this.fitObject();
            }, 1);

          });
        };

        img.src = this.url;
      }
      
      setTimeout(() => {
        
        animated.resolve(true);
        
      }, 251);

      return animated;
    }

    fitObject() {
      this.cloneEl.removeAttribute('style');
      this.cloneEl.style.width = '100%';
      this.cloneEl.style.userSelect = 'none';
      this.cloneEl.style.objectFit = 'contain';
      this.cloneEl.draggable = false;
      this.cloneEl.style.pointerEvents = 'none';
    }

    private fit(element: Size, box: Size) : Size {
      if (element.height <= box.height && element.width <= box.width) {
        return { width: element.width, height: element.height };
      }

      let mutiplier = (box.width / element.width);

      if (element.height * mutiplier <= box.height) {
        return {
          width  : box.width,
          height : Math.round(element.height * mutiplier)
        }
      }
      else {
        mutiplier = (box.height / element.height);

        return {
          width: Math.round(element.width * mutiplier),
          height:  box.height
        }
      }
    }

    onClosed() {
      this.element.classList.remove('open', 'closing');
      this.element.classList.add('closed');

      this.element.style.background = '';
      this.state = 'closed';

      this.sourceElement.style.visibility = 'visible';

      this.animating = false;
      this.cloneEl.remove();
    }
    
    zoomOut() {
      this.state = 'closing';

      this.cloneEl.style.transition = null;

      this.resetCloneStyle();

      if(!this.visible) return;

      this.animating = true;

      this.element.style.cursor = null;
      this.element.classList.add('closing');

      this.timestamp = null;
      
      this.visible = false;

      this.calculateTargetPosition(this.cloneEl.getBoundingClientRect());

      this.animating = true;

      this.element.style.background = 'transparent';
      
      _.trigger(this.element, 'lightbox:close');

      this.cloneEl.style.transition = `transform ${this.animationDuration}ms ease-out`;
      this.cloneEl.style.transform = `translate(${this.origin.left}px,${this.origin.top}px) scale(${this.origin.width / this.cloneEl.clientWidth})`;

      this.animationStart = new Date();

      setTimeout(() => {

        this.animating = false;

        this.onClosed();
      }, this.animationDuration + 3);

    }

    get width() {
      return this.element.clientWidth;
    }

    get height() {
      return this.element.clientHeight;
    }

    close() {
      this.element.classList.add('closed');
      this.element.classList.remove('open');
     
      _.trigger(this.element, 'lightbox:box', { });
    }

    createElement() {
      let element = document.createElement('div'); // div.lightbox
        
      element.className = 'lightbox';

      setStyle(element, { 
        position   : 'fixed',
        top        : '0',
        right      : '0',
        bottom     : '0',
        left       : '0',
        zIndex     : '100',
        visibility : 'hidden',
        userSelect : 'none'
      });

      let viewportEl = document.createElement('div');

      viewportEl.className = 'viewport';
     
      setStyle(viewportEl, { 
        display        : 'flex',
        overflow       : 'hidden',
        width          : '100%',
        height         : '100%',
        padding        : 25 + 'px',
        boxSizing      : 'border-box',
        justifyContent : 'center',
        userSelect     : 'none'
      });

      element.appendChild(viewportEl);

      document.body.appendChild(element);

      return element;
    }

  }  

  class Viewport {
    element: HTMLElement;
    content : ViewportContent;
    padding: any;
    gestures: any;

    reactive = new Carbon.Reactive();

    constructor(element: HTMLElement) {
      this.element = element;

      this.element.style.cursor = 'grab';
      
      this.padding = { 
        top: 25,
        right: 25,
        bottom: 25,
        left: 25
      }

			this.gestures = new Carbon.Gestures.Manager(this.element);

      this.gestures.add(new Carbon.Gestures.Pan({ threshold: 3, pointers: 0 }));

      this.gestures.on("pinchstart pinchmove", this.onPinch.bind(this));
			this.gestures.on("panstart", this.onPanStart.bind(this));
			this.gestures.on("panmove", this.onPanMove.bind(this));
      this.gestures.on("panend", this.onPanEnd.bind(this));
    }

    onPinch(e) {
      this.reactive.trigger('pinch', e);
    }

    onPanStart(e) {
      let a = { type: 'panstart' };

      Object.assign(a, e);

      this.reactive.trigger(a);
    }

    onPanMove(e) {      
      let a = { type: 'panmove' };

      Object.assign(a, e);

      this.reactive.trigger(a);
    }

    onPanEnd(e) {
      let a = { type: 'panend' };

      Object.assign(a, e);

      this.reactive.trigger(a);
    }

    on(type, callback) {
      return this.reactive.on(type, callback);
    }

    get innerHeight() {
			return (this.element.clientHeight - this.padding.top - this.padding.bottom);
		}

		get innerWidth() {
			return (this.element.clientWidth - this.padding.left - this.padding.right)
    }
    
		get height() {
			return (this.element.clientHeight);
		}

		get width() {
			return (this.element.clientWidth)
		}

		get bounds() {
			return this.element.getBoundingClientRect();
		}

		get offset() {
			return this.content.offset;
		}

    setSize(width: number, height: number) {
      this.element.style.width = width + 'px';
      this.element.style.height = height + 'px';
      
      this.content.relativeScale = new LinearScale([this.content.calculateMinScale(), 1]);
    }

    setOffset(offset: Point) {
      offset = this.clamp(offset);

      this.content._setOffset(offset);
    }
    
    clamp(offset: Point) {
      if (offset.x > 0) {
        offset.x = 0;
      }

      if (offset.y > 0) {
        offset.y = 0;
      }
      
      // outside viewport
      let xOverflow = this.content.width - this.width;      
      let yOverflow = this.content.height - this.height;


      if (-offset.x > xOverflow) {
       offset.x = -xOverflow;
      }

      if (-offset.y > yOverflow) {
        offset.y = -yOverflow;
      }
      
      return offset;
    }

    centerAt(anchor: Point) {			
      let x = this.content.width * anchor.x;
      let y = this.content.height * anchor.y;
      
      this.setOffset({
        x: - (((x * 2) - this.width) / 2),
        y: - (((y * 2) - this.height) / 2)
      });
    }
	}
	
	class ViewportContent {
    element: HTMLElement;
    viewport: Viewport;
    _scale = 1;
    relativeScale: LinearScale;
		offset = new Point(0, 0);

    constructor(element: HTMLElement, viewport: Viewport) {
      if (!element) throw new Error("element is null");
      if (!viewport) throw new Error("viewport is null");
      
      this.element = element;
      this.viewport = viewport;

      this.element.style.transformOrigin = '0 0';

      this.relativeScale = new LinearScale([this.calculateMinScale(), 1]); // to the min & max sizes
		
			// original height & width (may not be actual height & width)
		}

    // The minimum size for the content to fit entirely in the viewport
    // May be great than 1 (stretched)
    calculateMinScale(): number {
      let percentW = this.viewport.width / this.width;
      let percentH = this.viewport.height / this.height;

			// minScale
      return (percentH < percentW) 
				? percentW
				: percentH;
		}
		
		get x() { return this.offset.x;	}

		get y() { return this.offset.y; }

		get width() { return this.element.scrollWidth * this.scale; }

		get height() { return this.element.scrollHeight * this.scale;	}

		get scale() {
			return this._scale;
		}

		set scale(value) {
			this._scale = value;
			
			this.update();
		}

    _setOffset(offset: Point) {
      this.offset = offset;
        
      this.update();
    }
    
    setRelativeScale(value: number) {
      if (value > 1) return;

      this.scale = this.relativeScale.getValue(value); // Convert to absolute scale
      
      var anchor = this.viewport.anchorPoint;
      
      this.viewport.centerAt(anchor);
    }

    update() {

      console.log(this.viewport.width, this.width);
      
      if (this.width < this.viewport.width) {
        this.offset.x = (this.viewport.width - this.width) / 2;
      }

			this.element.style.transformOrigin = '0 0'; 
			this.element.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
    }
  }

  export class Pannable {
		element: HTMLElement;
		viewport: Viewport;
		enabled: boolean;

		position: { x: number, y: number };

		content: ViewportContent;
		dragging = false;

		panStartListener: any;
		panMoveListener: any;
		panEndListener: any;
		
		constructor(element: HTMLElement, viewport: Viewport) {

			if (!element) throw new Error("element is null");

			this.element = element;
			this.viewport = viewport || new Viewport(<HTMLElement>this.element.closest('.viewport'));
			
			this.viewport.content = new ViewportContent(this.element, this.viewport);

			this.content = this.viewport.content;

			// this.viewport.on("pinchstart pinchmove", this.onPinch.bind(this));
			this.panStartListener = this.viewport.on("panstart", this.onStart.bind(this));
			this.panMoveListener = this.viewport.on("panmove", this.onDrag.bind(this));
			this.panEndListener = this.viewport.on("panend", this.onEnd.bind(this));
		}

		enable() {
			this.enabled = true;
		}

		disable() {
			this.enabled = false;
		}

		onPinch(ev) {
			console.log('pinch');
		}

		center(ev?) {
			this.viewport.centerAt({ x: 0.5, y: 0.5 });

			this.position = this.content.offset;
		}

		update() {
		
		}

		reset() {
			this.element.classList.add('animate');
			this.element.draggable = false;

			this.center();
			
			this.update();
		}

		onStart(ev) {
			if (!this.enabled) return false;

			this.content.element.style.transition = null;
			
			this.position = this.content.offset;

			this.dragging = true;
			
			this.element.style.cursor = 'grabbing';
		}

		onEnd(ev) {
			setTimeout(() => {
				this.dragging = false;
			}, 1);

			this.element.style.cursor = null;
		}

		onDrag(ev) {
			if (!this.enabled) return false;

			console.log('DRAGGING PAN');
			
			this.viewport.setOffset({
				x: this.position.x + ev.deltaX,
				y: this.position.y + ev.deltaY
			});
		}
  }


  class Point {
    constructor(public x: number,
                public y: number) { }
  }

	class LinearScale {
    domain: Array<number>;
    range: Array<number>;

    constructor(domain: Array<number>) {
      this.domain = domain || [ 0, 1 ];
      this.range = [ 0, 1 ]; // Always 0-1
    }

    getValue(value: number) : number {
      let lower = this.domain[0];
      let upper = this.domain[1];

      let dif = upper - lower;

      return lower + (value * dif);
    }
  }
  

  class Deferred<T> {
    private _resolve: Function;
    private _reject: Function;

    promise: Promise<T>;

    constructor() {
      this.promise = new Promise((resolve, reject) => {
        this._resolve = resolve
        this._reject = reject
      });
    }

    resolve(value?: any) {
      this._resolve(value);
    }

    reject(value?: any) {
      this._reject(value);
    }
  }
}

Carbon.controllers.set('zoom', {
  in(e) {
    if (e.target.closest('carbon-indicator, .hovering')) return;
    Carbon.Lightbox.get().open(e.target);
  }
});

interface Size {
  width: number;
  height: number;
}

interface Box {
  width: number;
  height: number;
  top: number;
  left: number;
}