module Carbon {
  function setStyle(element: HTMLElement, data: any) {
    for (var key of Object.keys(data)) {
      element.style[key] = data[key];
    }
  }

  function getEventPromise(el, name) {
    return new Promise(function(resolve, reject) {
      el.addEventListener(name, e => {
        resolve();
      }, { once: true });
    });
  }

  const styles = 
`
carbon-lightbox {
  user-select: none;
  -webkit-user-select: none;
}

carbon-lightbox carbon-slide {
  position: absolute;
  top: 0;
  left: 0;
  padding: 25px;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  user-select: none;
  -webkit-user-select: none;
  transform-origin: 0 0;
  left: calc((var(--index, 0) * 100%) - (var(--slide-index, 0) * 100%));
}

carbon-lightbox carbon-slide .media-container {
  display: block;
  top: 0;
  left: 0;
  position: absolute;
}

carbon-lightbox carbon-slide .caption-wrapper {
  display: block;
  top: 0;
  left: 0;
  position: absolute;
  z-index: 100;
  width: 100%;
  text-align:center;
  cursor: auto;
  margin-top: 10px;
  user-select: text;
  -webkit-user-select: text;
}

carbon-lightbox img {
  user-drag: none;
  -webkit-user-drag: none;
}

carbon-lightbox.closing carbon-slide .caption-wrapper {
  display: none;
}

`;
  
  export class Lightbox {
    static instance: Lightbox;

    static get(options): Lightbox {
      // Lazily create an instance the first time it's used
      return Lightbox.instance || (Lightbox.instance = new Lightbox(options));
    }

    element: HTMLElement;

    scrollTop: number;

    viewport: Viewport;
    padding = 25;

    scale: number;
    origin: ClientRect;
        
    fittedBox: Box;

    cloneEl: HTMLElement;
    
    visible = false;
    animating = false;
    options: any;
            
    state = 'closed';

    easing = 'cubic-bezier(.175,.885,.32,1)';

    lastPan: Date;
    noPan = false;
    animation: any;
    panDirection: number;
    cursor: Cursor;
    reactive = new Carbon.Reactive();

    isSlideshow = false;

    slide: Slide;

    didScroll = false;
    raf: any;

    // buffer
    slides: Array<Slide> = [];

    getCaption: Function;

    constructor(options = null) {
      this.element = this.createElement();

      this.viewport = new Viewport(this.element.querySelector('.viewport'));

      window.addEventListener('scroll', this.onScroll.bind(this), false);
      window.addEventListener('resize', this.onResize.bind(this), false);

      document.addEventListener('keydown', this.onKeyDown.bind(this));

      this.options = options || { };

      if (!this.options.easing) {
        this.options.easing = 'easeOutQuad';
      }

      if (!this.options.slideEasing) {
        this.options.slideEasing = 'cubic-bezier(.175,.885,.32,1)';
      }

      if (!this.options.slideDuration) {
        this.options.slideDuration = 500;
      }
      
      if (!this.options.zoomInDuration) {
        this.options.zoomInDuration = 200;
      }

      if (!this.options.zoomInEasing) {
        this.options.zoomInEasing = 'easeOutQuad';
      }

      if (!this.options.zoomOutDuration) {
        this.options.zoomOutDuration = 200;
      }

      if (!this.options.zoomOutEasing) {
        this.options.zoomOutEasing = 'easeOutQuad';
      }

      if (!this.options.topEdgeCarveOutForClose) {
        this.options.topEdgeCarveOutForClose = 0.1;
      }

      if (!this.options.flipperCarveOut) {
        this.options.flipperCarveOut = 0.2;
      }
      
      this.cursor = this.options.cursor;
      
      if (this.cursor) {
        this.viewport.element.style.cursor = 'none';

        this.cursor.on('move', this.onCursorMove.bind(this));
      }

      this.viewport.on('panstart', this.onPanStart.bind(this));
      this.viewport.on('panmove', this.onPanMove.bind(this));
      this.viewport.on('panend', this.onPanEnd.bind(this));
      this.viewport.on('tap', this.onTap.bind(this));

      let styleEl = document.createElement('style');

      styleEl.textContent = styles;

      this.element.appendChild(styleEl);
    }

    on(type: string, callback: Function) {
      return this.reactive.on(type, callback);
    }

    onKeyDown(e: KeyboardEvent) {
      if (!this.element.classList.contains('open')) return;

      if (this.isSlideshow) {
        switch (e.keyCode) {
          case 39: this.next(); break; // right
          case 37: this.prev(); break; // left
        }
      }
  
      if (e.keyCode !== 27) return; // escape        

      this.zoomOut({ });
    }

    async onCursorMove(e: any) {
      if (!this.visible || this.state == 'opening') return;

      if (e.target && e.target.closest('.caption-wrapper')) {

        this.cursor.hide();

        return;
      }

      let distanceFromRight = document.body.clientWidth - e.clientX;
      let distanceFromBottom = document.body.clientHeight - e.clientY;

      var topEdgeCarveOutPx = this.options.topEdgeCarveOutForClose > 1 
        ? this.options.topEdgeCarveOutForClose 
        : this.options.topEdgeCarveOutForClose * this.viewport.height;
    
      let nearTop = e.clientY < topEdgeCarveOutPx;
      let nearBottom = distanceFromBottom < 200;

      const flipperCarveOutPx = this.options.flipperCarveOut > 1 
        ? this.options.flipperCarveOut
        : this.options.flipperCarveOut * this.viewport.width;
      
      if (this.isSlideshow) {
        if (distanceFromRight < flipperCarveOutPx && !nearTop && !nearBottom && this.hasNextSlide) {
          await this.cursor.toRightArrow();
        
          return;
        }
        else if (e.clientX < flipperCarveOutPx && !nearTop && !nearBottom && this.hasPrevSlide) {
          await this.cursor.toLeftArrow();        
        
          return;
        }
      }

     

      this.cursor.show();

      if (e.target && e.target.closest('on-click')) {
        this.cursor.hide();
      }
      else {
        await this.cursor.toZoomOut();
      }
      /*
      else if (e.target && e.target.closest('img')) {
        await this.cursor.toZoomOut();
      }
      else {
        await this.cursor.toClose();
      }
      */
    }

    async open(sourceElement: HTMLElement) {      
      if (this.animating || this.visible) {
        return;
      }

      if (this.cursor) {
        this.cursor.show();
        this.cursor.mode = 'manual';
      }
      else {
        this.element.style.cursor = 'zoom-out';
      }

      let item = new LightboxItem(sourceElement);

      this.reactive.trigger({
        type    : 'open',
        element : this.element,
        item    : item
      });

      this.scale = 0;
      
      let cloneEl = this.createClone(item);

      this.slide = Slide.create(item, cloneEl, this); 

      this.slides[this.slide.index] = this.slide;

      this.element.style.setProperty('--slide-index', this.slide.index.toString());
      
      this.slideContainerEl.appendChild(this.slide.element);

      this.setBox(item, this.slide.captionHeight);

      this.positionAndScaleToSourceElement(cloneEl);

      this.visible = true;

      this.element.classList.add('open');
      this.element.classList.remove('closed');
      this.element.style.visibility = 'visible';

      this.item.hideSource();
      
      await this.zoomIn(this.options.zoomInDuration);
      
      this.isSlideshow && this.preloadSlides();
    }

    get item() {
      if (!this.slide) return null;

      return this.slide.item;
    }

    get hasPrevSlide() {
      return this.slide.item.index > 0;
    }

    get hasNextSlide() {
      return this.slides[this.slide.item.index + 1] !== undefined;
    }

    getItem(index: number) {
      if (index < 0) return false;

      let el = document.querySelector(`[data-index='${index}']`) as HTMLElement;

      return el 
        ? new LightboxItem(el)
        : null;
    }

    onPanEnd(e: any) {
      this.reactive.trigger({
        type: 'panEnd',
        element: this.element
      });

      this.noPan = false;
      this.lastPan = new Date();

      if (this.isSlideshow) {
        let a = e.deltaX / this.viewport.width;

        if (a < -0.3 && this.panDirection === 2 && this.hasNextSlide) { // right
          this.next();

          return;
        }
        else if ( a > 0.3 && this.panDirection === 4 && this.hasPrevSlide) { // left
          this.prev();

          return;
        }
      }

      this.cursor && this.cursor.show();

      if (this.panDirection == 4 || this.panDirection == 2) {
        this.resetSlides();
        
        return;
      }

      // this.cloneEl.style.transition = null;

      this.panDirection = null;

      if (Math.abs(e.deltaY) > 150) {
        this.animating = true;

        this.slide.element.style.transition = null;

        this.slide.element.style.transform = `translateY(0px)`;


        // TODO: offset the object... 

       this.zoomOut({ offsetY: e.deltaY });
      }
      else {
        this.element.style.transform = null;
        this.element.style.setProperty('--background-opacity', '1');

        this.slide.element.style.transition = `transform 200ms ease-in`;
        this.slide.element.style.transform = `translateY(0px)`;
      }      
    }

    async next() {
      if (!this.hasNextSlide || this.animating) return;

      this.item.showSource();
      
      for (var el of Array.from<HTMLElement>(this.element.querySelectorAll('carbon-slide'))) {
        el.style.transition = `transform ${this.options.slideDuration}ms ${this.options.slideEasing}`;
        el.style.transform = `translateX(-100%)`;
      }
      
      this.animating = true;

      await getEventPromise(this.slide.element, 'transitionend');

      this.slide.deactivate();

      this.slide = this.slides[this.slide.index + 1];

      this.element.style.setProperty('--slide-index', this.slide.index.toString());

      for (var slide of this.slides) {
        slide && slide.reset();
      }
      
      this.preloadSlides();

      this.animating = false;

      this.cursor && this.onCursorMove(this.cursor.lastEvent);
    }

    async prev() {
      if (!this.hasPrevSlide || this.animating) return;
      
      this.item.showSource();

      this.animating = true;
      
      for (var el of Array.from<HTMLElement>(this.element.querySelectorAll('carbon-slide'))) {
        el.style.transition = `transform ${this.options.slideDuration}ms ${this.options.slideEasing}`;
        el.style.transform = `translateX(100%)`;
      }

      await getEventPromise(this.slide.element, 'transitionend');

      this.slide = this.slides[this.slide.index - 1];

      this.element.style.setProperty('--slide-index', this.slide.index.toString());

      for (var slide of this.slides) {
        slide && slide.reset();
      }
      
      this.preloadSlides();

      this.animating = false;

      this.cursor && this.onCursorMove(this.cursor.lastEvent);
    }
    
    onPanStart(e: any) {
      if (e.target && e.target.closest('.caption')) {
        this.noPan = true;

        return false;
      } 

      if (this.animating) return;

    
      // 16 = down
      // 8 = up
      // 4 = right
      // 2 = left

      this.panDirection = e.offsetDirection;

      this.cursor && this.cursor.hide();


      this.reactive.trigger({
        type      : 'panStart',
        direction : this.panDirection,
        element   : this.element
      });

      for (var slideEl of Array.from<HTMLElement>(this.element.querySelectorAll('carbon-slide'))) {
        slideEl.style.transition = null;
      }
    }

    onPanMove(e: any) {
      if (this.animating || this.noPan) { 
        return;
      }      

      if (e.target && e.target.closest('.caption-wrapper')) {
        return;
      }


      if ((this.panDirection == 4 || this.panDirection == 2) && !this.isSlideshow) {
        return;
      }

      let transform = '';

      if (this.panDirection == 16 || this.panDirection == 8) {
        let backgroundOpacity = 1 - Math.abs(e.deltaY / (this.height / 2));

        this.element.style.setProperty('--background-opacity', backgroundOpacity.toString());
      }

      switch (this.panDirection) {
        case 16:
        case 8: transform = `translateY(${e.deltaY}px)`; break;
        case 4:
        case 2: transform = `translateX(${e.deltaX}px)`; break;
      }

      for (var slideEl of Array.from<HTMLElement>(this.element.querySelectorAll('carbon-slide'))) {
        slideEl.style.transform = transform;
      }
    }

    async onTap(e: any) {      
      if (this.animating && this.state !== 'opening') return;
      
      if (e.target && e.target.closest('.caption-wrapper')) {
        return false;
      } 

      if (this.animating) {
        this.animation.pause();
        
        this.zoomOut();

        return;
      }

      if (this.cursor) {
        if (this.cursor.type == 'right-arrow') {
          this.next();
          return;
        }
        
        if (this.cursor.type == 'left-arrow') {
          this.prev();
          return;
        }
      }

      if (e.target, e.target.closest('[on-click]')) return;
      
      if (this.lastPan) {
        // time since they completed the last pan
        let d = new Date().getTime() - this.lastPan.getTime();

        if (d < 100) {
          return;
        }
      }

      this.zoomOut();
    }

    createClone(item: LightboxItem) {      
      let cloneEl = item.sourceElement.cloneNode(true) as HTMLElement;

      // Safari scales up the original pixels of sub-elements
      // - use an IMG

      if (cloneEl.tagName == 'CARBON-IMAGE' && cloneEl.querySelector('img,video')) {
        cloneEl = cloneEl.querySelector('img,video');

        cloneEl.width = item.width;
        cloneEl.height = item.height;
    
        cloneEl.removeAttribute('data-src');
        cloneEl.removeAttribute('data-srcset');

        cloneEl.style.imageRendering = 'pixelated';
      }

      cloneEl.removeAttribute('style');
      
      cloneEl.classList.add('clone');
      cloneEl.classList.remove('zoomable', 'lazy', 'loaded');

      cloneEl.removeAttribute('on-click');
      
      return cloneEl;
    }
    
    positionAndScaleToSourceElement(cloneEl) {
      let originBox = this.item.originBox;

      // position over the current element
      setStyle(cloneEl, {
        display         : 'block',
        position        : 'absolute',
        top             : '0',
        left            : '0',
        width           : originBox.width  + 'px',
        height          : originBox.height + 'px',
        transformOrigin : 'left top',
        transform       : `translateX(${originBox.left}px) translateY(${originBox.top}px) scale(1)`
      });
    }

    setBox(element: Size, captionHeight = 0) {
      let originBox = this.item.originBox;

      this.fittedBox = this.fitToViewport(element, captionHeight);

      this.slide.fitCaption(this);
      
      this.scale = this.fittedBox.width / originBox.width;
    }

    fitToViewport(item: Size, captionHeight = 0) {

      let vh = this.viewport.innerHeight - captionHeight;
      let wh = this.height - captionHeight;
      let ww = this.width;

      let size = this.fit(item, { 
        width: this.viewport.innerWidth,
        height: vh
      });

      let box = {
        width  : size.width,
        height : size.height,
        top    : (wh - size.height) / 2,
        left   : (ww - size.width) / 2
      };

      if (item.top) {
        box.top = item.top;
      }

      if (item.left) {
        box.left = item.left;
      }

      return box;
    }

    onScroll() {
      if (!this.slide) return;

      if (this.state == 'opening') {
        return;
      }
      
      if (this.visible && Math.abs(this.scrollTop - window.scrollY) > 15) {
        this.zoomOut();
      }
    }

    onResize() {
      this.raf && window.cancelAnimationFrame(this.raf);

      let base = this;

      this.raf = window.requestAnimationFrame(() => {
        for (var slide of this.slides) {

          slide && slide.fit(base);
        }
      });
    }

    async zoomIn(duration = 200) {
      this.state = 'opening';

      if (this.cursor) {
        this.cursor.toZoomOut();
        this.cursor.scale(1);
      }

      this.scrollTop = document.body.scrollTop;

      this.element.style.setProperty('--background-opacity', '1');

      this.viewport.element.style.transform = null;

      let deferred = new Deferred<boolean>();

      this.element.classList.add('opening');

      this.animation && this.animation.pause();
      
      this.animating = true;      

      let originBox = this.item.originBox;

      let objectEl = this.slide.objectEl;

      objectEl.style['will-change'] = 'transform';

      this.animation = anime({
        targets    :   objectEl,
        duration   :   duration,
        translateX : [ originBox.left, this.fittedBox.left ],
        translateY : [ originBox.top, this.fittedBox.top ],
        scale      : [ 1, this.scale ],
        easing     :   this.options.zoomInEasing,
      });

      let otherImg: HTMLImageElement = objectEl instanceof HTMLImageElement
        ? objectEl
        : objectEl.querySelector('img');
  
      let otherVideo: HTMLVideoElement = objectEl instanceof HTMLVideoElement
        ? objectEl
        : objectEl.querySelector('video');

      let sourceVideo = this.item.sourceElement instanceof HTMLVideoElement
          ? this.item.sourceElement
          : this.item.sourceElement.querySelector('video');
      
      if (sourceVideo && otherVideo) {
          otherVideo.currentTime = sourceVideo.currentTime;    
      }

      await this.animation.finished;

      this.animating = false;
      this.animation = null;

      this.state = 'opened';
      
      if (otherImg) {
        let img = new Image();

        img.src = this.item.url;

        img.decode().then(() => {
          // force redraw to fix iPad bug
          objectEl.style['will-change'] = null;
          
          otherImg.src = img.src;
          otherImg.srcset = img.src + ' 1x';
          otherImg.style.imageRendering = null;
        });
      }

      else if (otherVideo) {
        let video = otherVideo.cloneNode() as HTMLVideoElement;

        video.src = `${this.item.url}#${sourceVideo.currentTime}`;
        video.currentTime = sourceVideo.currentTime;

        video.play().then(() => {
          otherVideo.replaceWith(video);

          video.currentTime = sourceVideo.currentTime;

          if (this.slide && this.slide.objectEl instanceof HTMLVideoElement) {
            this.slide.objectEl = video;
          }
        });
      }
      
      deferred.resolve(true);

      this.element.classList.remove('opening');
   
      return deferred;
    }
    
    preloadSlides() {      
      let prevItem = this.getItem(this.item.index - 1);
      let nextItem = this.getItem(this.item.index + 1);
      
      if (prevItem && this.slides[prevItem.index] === undefined) {        
        let prevSlide = this.buildSlide(prevItem);

        this.slides[prevItem.index] = prevSlide;
      }

      if (nextItem && this.slides[nextItem.index] === undefined) {
        let nextSlide = this.buildSlide(nextItem);

        this.slides[nextItem.index] = nextSlide;        
      }
    }

    buildSlide(item: LightboxItem) {
      let objectEl = this.createClone(item);

      let slide = Slide.create(item, objectEl, this); 
            
      if (slide.objectEl.tagName == 'IMG') {
        slide.objectEl.src = item.url;
        slide.objectEl.srcset = item.url + ' 1x';
      }

      this.slideContainerEl.appendChild(slide.element);

      slide.fit(this);

      return slide;
    }

    resetSlides() {
      var slideEls = Array.from<HTMLElement>(this.element.querySelectorAll('carbon-slide'));

      for (var el of slideEls) {
        el.style.transition = `transform 200ms ${this.easing}`;
        el.style.transform = `translateX(0)`;
      }
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

    private onClosed() {
      this.reactive.trigger({
        type: 'close',
        element: this.element
      });

      if (this.cursor) {
        this.cursor.mode = 'dynamic';
      }

      this.didScroll = false;
            
      this.element.classList.remove('open', 'closing');
      this.element.classList.add('closed');

      this.element.style.background = '';
      this.state = 'closed';

      this.item.showSource();
      
      this.animating = false;
      
      while (this.slides.length) {
        let s = this.slides.pop();

        s && s.destroy();
      }

      this.slide = null;

      this.viewport.element.innerHTML = '';
    }
    
    async zoomOut(options?: any) {
      if (!this.slide) return;

      if(!this.visible) return;

      options = options || { };

      this.state = 'closing';
      this.element.classList.add('closing');

      this.cursor && this.cursor.scale(this.cursor.defaultScale);                 
    
      this.reactive.trigger({
        type    : 'closing',
        element : this.element,
        item    : this.slide.item
      });
      
      this.element.style.cursor = null;

      this.setBox(this.item, this.slide.captionHeight);
      
      
      this.visible = false;
      this.animating = true;

      this.element.style.background = 'transparent';

      this.animation && this.animation.pause();
      
      await this.animateBackToOrigin(this.options.zoomOutDuration, this.options.zoomOutEasing, options).finished;

      this.animating = false;
      this.animation = null;

      this.onClosed();
    }

    animateBackToOrigin(duration: number, easing = 'easeOutQuad', options) {
      let objectEl = this.slide.objectEl;
      
      this.animation && this.animation.pause();
      
      let offsetY = 0;

      if (options && options.offsetY) {
        offsetY = options.offsetY;
      }



      let top = parseInt(anime.get(objectEl, 'translateY', 'px'));

      top += offsetY;

      console.log(offsetY, top);

      this.scrollTop = document.body.scrollTop;

      let originBox = this.item.originBox;

      let targets = [ objectEl ];

      objectEl.style['will-change'] = 'transform';

      this.animation = anime({
        targets    : targets,
        duration   : duration,
        scale      : originBox.width / objectEl.clientWidth,
        translateX : originBox.left,
        translateY : [ top, originBox.top ],
        update: (anim) => { 
          let scrollY = this.scrollTop - document.body.scrollTop;

          let val = parseFloat(anime.get(objectEl, 'translateY', 'px'));

          anime.set(targets, { 
            translateY: val + scrollY
          });
        },
        easing: easing
      });

      return this.animation;
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
    }

    createElement() {
      let element = document.createElement('carbon-lightbox');
        
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

      let backgroundEl = document.createElement('div');

      backgroundEl.classList.add('background');

      setStyle(backgroundEl, { 
        position : 'absolute',
        width    : '100%',
        height   : '100%',
        top      : '0px',
        left     : '0px'
      });

      let viewportEl = document.createElement('div');

      viewportEl.className = 'viewport';
     
      setStyle(viewportEl, { 
        overflow       : 'hidden',
        position       : 'relative',
        width          : '100%',
        height         : '100%',
        userSelect     : 'none'
      });

      element.appendChild(backgroundEl);
      element.appendChild(viewportEl);

      document.body.appendChild(element);

      return element;
    }

    get slideContainerEl() {
      return this.viewport.element;
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
      this.gestures.add(new Carbon.Gestures.Tap());

      this.gestures.on("pinchstart pinchmove", this.onPinch.bind(this));
			this.gestures.on("panstart", this.onPanStart.bind(this));
			this.gestures.on("panmove", this.onPanMove.bind(this));
      this.gestures.on("panend", this.onPanEnd.bind(this));
      this.gestures.on("tap", this.onTap.bind(this));
    }

    onPinch(e: any) {
      this.reactive.trigger('pinch', e);
    }

    onTap(e: any) {
      this.reactive.trigger('tap', e);
    }

    onPanStart(e: any) {
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
  
  // viewport
  //   carbon-slide.prev
  //   carbon-slide
  //   carbon-slide.next

  class Slide {
    lightbox  : Lightbox;
    item      : LightboxItem;
    element   : HTMLElement;
    boxEl     : HTMLElement;
    objectEl  : HTMLElement;
    captionEl : HTMLElement;

    x = 0;
    y = 0;

    constructor(element: HTMLElement, lightbox: Lightbox) {
      this.element = element;
      this.lightbox = lightbox;
    }

    get mediaContainerEl() {
      return this.element.querySelector('.media-container');
    }

    reset() {
      this.element.style.transform = null;
      this.element.style.transition = null;
    }

    setObjectElement(objectEl: HTMLElement) {
      this.objectEl = objectEl;

      this.mediaContainerEl.innerHTML = '';

      this.mediaContainerEl.appendChild(objectEl);
    }
    
    get index() { 
      return this.item.index;
    }

    deactivate() { }

    activate() { }

    destroy() {
      this.item = null;
      this.objectEl = null;
      this.element.remove();
    }

    fit(lightbox: Lightbox) {
      let box = lightbox.fitToViewport(this.item, this.captionHeight);
      
      let originBox = this.item.originBox;

      let scale = box.width / originBox.width;
      
      setStyle(this.objectEl, {
        display          : 'block',
        position         : 'absolute',
        top              : '0',
        left             : '0',
        width            : originBox.width  + 'px',
        height           : originBox.height + 'px',
        transformOrigin  : 'left top',
        transition       : null,
        maxHeight        : null,
        maxWidth         : null,
        transform        : `translateX(${box.left}px) translateY(${box.top}px) scale(${scale})`
      });      

      this.captionEl && this.fitCaption(lightbox);
    }

    fitCaption(lightbox: Lightbox) {
      let box = lightbox.fitToViewport(this.item, this.captionHeight);
      
      this.objectEl.dataset['width'] = box.width.toString();
      this.objectEl.dataset['height'] = box.height.toString();
   
      if (this.captionEl) {
        this.captionEl.style.top = (box.top + box.height) + 'px';
      }
    }

    get captionHeight() {
      if (!this.captionEl) return 0;

      return _outerHeight(this.captionEl);
    }

    static create(item: LightboxItem, objectEl: HTMLElement, lightbox: Lightbox) {
      let element = document.createElement('carbon-slide');

      var slide = new Slide(element, lightbox);      

      slide.item = item;

      slide.element.style.setProperty('--index', item.index.toString());

      let mediaContainerEl = document.createElement('div');

      mediaContainerEl.className = 'media-container';

      element.appendChild(mediaContainerEl);

      slide.setObjectElement(objectEl);
      
      let caption: string;

      if (lightbox.getCaption) {
        caption = lightbox.getCaption(slide);
      }
      else if (item.caption) {
        caption = unescape(item.caption);
      }

      if (caption) {
        let captionEl = document.createElement('div');

        captionEl.className = 'caption-wrapper';
        captionEl.innerHTML = caption;

        element.appendChild(captionEl);

        slide.captionEl = captionEl;
      }
    
      lightbox.reactive.trigger({
        type: 'slideCreated',
        slide: slide
      });
    
      return slide;
    }
  }

  export class LightboxItem {
    sourceElement: HTMLElement;
    width: number;
    height: number;
    image?: HTMLImageElement;
    index = 0;
    caption: string;

    constructor(sourceElement: HTMLElement) {
      this.sourceElement = sourceElement;

      let { zoomSize, caption } = sourceElement.dataset;

      if (zoomSize) {
        let parts = zoomSize.split('x');
        
        this.width = parseInt(parts[0], 10);
        this.height = parseInt(parts[1], 10);
      }

      this.caption = caption;

      let indexEl = this.sourceElement.closest('[data-index]') as HTMLElement;

      if (indexEl) {
        this.index = parseInt(indexEl.dataset['index'])
      }
    }

    get originBox() : DOMRect {
      return this.sourceElement.getBoundingClientRect();
    }

    hideSource() {
      this.sourceElement.style.visibility = 'hidden';
    }

    showSource() {
      this.sourceElement.style.visibility = null;
    }
    
    get url() {
      return this.sourceElement.dataset.zoomSrc;
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
      
      let anchor = this.viewport.anchorPoint;
      
      this.viewport.centerAt(anchor);
    }

    update() {
      // console.log(this.viewport.width, this.width);
      
      if (this.width < this.viewport.width) {
        this.offset.x = (this.viewport.width - this.width) / 2;
      }

      if (this.height < this.viewport.height) {
        this.offset.y = (this.viewport.height - this.height) / 2;
      }

      this.element.style.transformOrigin = '0 0'; 
      
			this.element.style.transform = `translateX(${this.x}px) translateY(${this.y}px) scale(${this.scale})`;
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

function _outerHeight(el: HTMLElement) {
  var height = el.offsetHeight;
  var style = getComputedStyle(el);

  height += parseInt(style.marginTop) + parseInt(style.marginBottom);
  return height;
}

Carbon.controllers.set('zoom', {
  in(e) {
    if (e.target.closest('carbon-indicator, .hovering')) return;

    let lightbox = Carbon.Lightbox.get({ cursor: window.cursor });

    lightbox.open(e.target);

    window.lightbox = lightbox;
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