"use strict";
var Carbon;
(function (Carbon) {
    function setStyle(element, data) {
        for (var key of Object.keys(data)) {
            element.style[key] = data[key];
        }
    }
    function getEventPromise(el, name) {
        return new Promise(function (resolve, reject) {
            el.addEventListener(name, e => {
                resolve();
            }, { once: true });
        });
    }
    const styles = `
carbon-lightbox {
  user-select: none;
  -webkit-user-select: none;
}

carbon-lightbox carbon-slide {
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0;
  left: 0;
  padding: 25px;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  justify-content: center;
  user-select: none;
  -webkit-user-select: none;
  transform-origin: 0 0;
  left: calc((var(--index, 0) * 100%) - (var(--slide-index, 0) * 100%));
}

carbon-lightbox img {
  user-drag: none;
  -webkit-user-drag: none;
}
`;
    class Lightbox {
        constructor(options = null) {
            this.padding = 25;
            this.visible = false;
            this.animating = false;
            this.state = 'closed';
            this.easing = 'cubic-bezier(.175,.885,.32,1)';
            this.didPan = false;
            this.reactive = new Carbon.Reactive();
            this.isSlideshow = false;
            this.didScroll = false;
            this.slides = [];
            this.element = this.createElement();
            this.viewport = new Viewport(this.element.querySelector('.viewport'));
            window.addEventListener('scroll', this.onScroll.bind(this), false);
            document.addEventListener('keydown', this.onKeyDown.bind(this));
            this.options = options || {};
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
            this.cursor = options.cursor;
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
        static get(options) {
            return Lightbox.instance || (Lightbox.instance = new Lightbox(options));
        }
        on(type, callback) {
            return this.reactive.on(type, callback);
        }
        onKeyDown(e) {
            if (!this.element.classList.contains('open'))
                return;
            if (this.isSlideshow) {
                switch (e.keyCode) {
                    case 39:
                        this.next();
                        break;
                    case 37:
                        this.prev();
                        break;
                }
            }
            if (e.keyCode !== 27)
                return;
            if (this.pannable && this.pannable.enabled) {
                this.pannable.reset();
                this.pannable.disable();
            }
            else {
                this.zoomOut({});
            }
        }
        async onCursorMove(e) {
            if (!this.visible || this.state == 'opening')
                return;
            let distanceFromRight = document.body.clientWidth - e.clientX;
            let distanceFromBottom = document.body.clientHeight - e.clientY;
            let nearTop = false;
            let nearBottom = false;
            const edgeDistance = this.viewport.width * 0.2;
            if (this.isSlideshow) {
                if (distanceFromRight < edgeDistance && !nearTop && !nearBottom && this.hasNextSlide) {
                    await this.cursor.toRightArrow();
                    return;
                }
                else if (e.clientX < edgeDistance && !nearTop && !nearBottom && this.hasPrevSlide) {
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
        }
        async open(sourceElement) {
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
                type: 'open',
                element: this.element,
                item: item
            });
            this.scale = 0;
            let cloneEl = this.createClone(item);
            this.slide = Slide.create(item);
            this.slides[this.slide.index] = this.slide;
            this.element.style.setProperty('--slide-index', this.slide.index.toString());
            this.slide.element.appendChild(cloneEl);
            this.slideContainerEl.appendChild(this.slide.element);
            this.calculateBox(item);
            this.positionAndScaleToSourceElement(cloneEl);
            this.visible = true;
            this.element.classList.add('open');
            this.element.classList.remove('closed');
            this.element.style.visibility = 'visible';
            this.pannable = new Carbon.Pannable(cloneEl, this.viewport);
            this.item.hideSource();
            await this.zoomIn(this.options.zoomInDuration);
            this.isSlideshow && this.preloadSlides();
        }
        get item() {
            if (!this.slide)
                return null;
            return this.slide.item;
        }
        get hasPrevSlide() {
            return this.slide.item.index > 0;
        }
        get hasNextSlide() {
            return this.slides[this.slide.item.index + 1] !== undefined;
        }
        getItem(index) {
            if (index < 0)
                return false;
            let el = document.querySelector(`[data-index='${index}']`);
            return el
                ? new LightboxItem(el)
                : null;
        }
        onPanEnd(e) {
            this.reactive.trigger({
                type: 'panEnd',
                element: this.element
            });
            if (this.pannable.enabled || this.pannable.dragging)
                return;
            this.didPan = true;
            if (this.isSlideshow) {
                let a = e.deltaX / this.viewport.width;
                if (a < -0.3 && this.panDirection === 2 && this.hasNextSlide) {
                    this.next();
                    return;
                }
                else if (a > 0.3 && this.panDirection === 4 && this.hasPrevSlide) {
                    this.prev();
                    return;
                }
            }
            this.cursor && this.cursor.show();
            this.didPan = true;
            if (this.panDirection == 4 || this.panDirection == 2) {
                this.resetSlides();
                return;
            }
            this.panDirection = null;
            if (Math.abs(e.deltaY) > 150) {
                this.animating = true;
                this.slide.element.style.transition = null;
                this.slide.element.style.transform = `translateY(0px)`;
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
            if (!this.hasNextSlide || this.animating)
                return;
            this.item.showSource();
            for (var el of Array.from(this.element.querySelectorAll('carbon-slide'))) {
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
            if (!this.hasPrevSlide || this.animating)
                return;
            this.item.showSource();
            this.animating = true;
            for (var el of Array.from(this.element.querySelectorAll('carbon-slide'))) {
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
        onPanStart(e) {
            if (this.animating || this.pannable.enabled)
                return;
            this.panDirection = e.offsetDirection;
            this.cursor && this.cursor.hide();
            this.slide.fitObject();
            this.reactive.trigger({
                type: 'panStart',
                direction: this.panDirection,
                element: this.element
            });
            for (var slideEl of Array.from(this.element.querySelectorAll('carbon-slide'))) {
                slideEl.style.transition = null;
            }
        }
        onPanMove(e) {
            if (this.animating || this.pannable.enabled) {
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
                case 8:
                    transform = `translateY(${e.deltaY}px)`;
                    break;
                case 4:
                case 2:
                    transform = `translateX(${e.deltaX}px)`;
                    break;
            }
            for (var slideEl of Array.from(this.element.querySelectorAll('carbon-slide'))) {
                slideEl.style.transform = transform;
            }
        }
        get isPannable() {
            let objectEl = this.slide.objectEl;
            return objectEl.classList.contains('pannable') || objectEl.hasAttribute('pannable');
        }
        async onTap(e) {
            if (this.animating && this.state !== 'opening')
                return;
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
            if (e.target, e.target.closest('[on-click]'))
                return;
            if (this.didPan) {
                this.didPan = false;
                return;
            }
            if (this.pannable.dragging) {
                return;
            }
            let maxScale = this.item.width / this.fittedBox.width;
            let canPan = this.isPannable && maxScale > 1;
            if (!canPan) {
                this.zoomOut();
                return;
            }
            let objectEl = this.slide.objectEl;
            if (this.pannable.enabled) {
                this.pannable.content._scale = 1;
                objectEl.style.transition = `transform 250ms ${this.easing}`;
                objectEl.style.transform = `scale(1) translateX(${this.fittedBox.left}px) translateY(${this.fittedBox.top}px)`;
                this.pannable.disable();
                this.state = 'opened';
                return;
            }
            this.state = 'panning';
            this.slide.fitObject();
            this.calculateBox(this.item);
            let l = e.clientX - this.fittedBox.left;
            let t = e.clientY - this.fittedBox.top;
            let anchor = {
                x: (l / this.fittedBox.width),
                y: (t / this.fittedBox.height)
            };
            this.pannable.enable();
            objectEl.style.width = this.fittedBox.width + 'px';
            objectEl.style.height = this.fittedBox.height + 'px';
            objectEl.style.position = 'absolute';
            objectEl.style.top = '0';
            objectEl.style.left = '0';
            objectEl.style.transition = null;
            objectEl.style.transformOrigin = '0px 0px';
            objectEl.style.transform = `scale(1) translateX(${this.fittedBox.left}px) translateY(${this.fittedBox.top}px)`;
            requestAnimationFrame(() => {
                objectEl.style.transition = `transform 250ms ${this.easing}`;
                this.pannable.content._scale = this.item.width / this.fittedBox.width;
                this.pannable.viewport.centerAt(anchor);
            });
        }
        createClone(item) {
            let cloneEl = item.sourceElement.cloneNode(true);
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
            setStyle(cloneEl, {
                display: 'block',
                position: 'absolute',
                top: '0',
                left: '0',
                width: originBox.width + 'px',
                height: originBox.height + 'px',
                transformOrigin: 'left top',
                transform: `translateX(${originBox.left}px) translateY(${originBox.top}px) scale(1)`
            });
        }
        calculateBox(elementSize) {
            let originBox = this.item.originBox;
            let size = this.fit(elementSize, {
                width: this.viewport.innerWidth,
                height: this.viewport.innerHeight
            });
            this.fittedBox = {
                width: size.width,
                height: size.height,
                top: (this.height - size.height) / 2,
                left: (this.width - size.width) / 2
            };
            if (elementSize.top) {
                this.fittedBox.top = elementSize.top;
            }
            if (elementSize.left) {
                this.fittedBox.left = elementSize.left;
            }
            this.scale = this.fittedBox.width / originBox.width;
        }
        onScroll() {
            if (!this.slide)
                return;
            if (this.state == 'opening') {
                return;
            }
            if (this.visible && Math.abs(this.scrollTop - window.scrollY) > 15) {
                this.zoomOut();
            }
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
            let deferred = new Deferred();
            this.element.classList.add('opening');
            this.animation && this.animation.pause();
            this.animating = true;
            let originBox = this.item.originBox;
            let objectEl = this.slide.objectEl;
            objectEl.style['will-change'] = 'transform';
            this.animation = anime({
                targets: objectEl,
                duration: duration,
                translateX: [originBox.left, this.fittedBox.left],
                translateY: [originBox.top, this.fittedBox.top],
                scale: [1, this.scale],
                easing: this.options.zoomInEasing,
            });
            let otherImg = objectEl instanceof HTMLImageElement
                ? objectEl
                : objectEl.querySelector('img');
            await this.animation.finished;
            this.animating = false;
            this.animation = null;
            this.state = 'opened';
            if (otherImg) {
                otherImg.onload = () => {
                    this.state == 'opened' && this.slide.fitObject();
                };
                otherImg.decoding = 'sync';
                otherImg.src = this.item.url;
                otherImg.srcset = this.item.url + ' 1x';
                otherImg.style.imageRendering = null;
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
        buildSlide(item) {
            let slide = Slide.create(item);
            slide.element.appendChild(this.createClone(item));
            if (slide.objectEl.tagName == 'IMG') {
                slide.objectEl.src = item.url;
                slide.objectEl.srcset = item.url + ' 1x';
            }
            slide.fitObject();
            this.slideContainerEl.appendChild(slide.element);
            return slide;
        }
        resetSlides() {
            var slideEls = Array.from(this.element.querySelectorAll('carbon-slide'));
            for (var el of slideEls) {
                el.style.transition = `transform 200ms ${this.easing}`;
                el.style.transform = `translateX(0)`;
            }
        }
        fit(element, box) {
            if (element.height <= box.height && element.width <= box.width) {
                return { width: element.width, height: element.height };
            }
            let mutiplier = (box.width / element.width);
            if (element.height * mutiplier <= box.height) {
                return {
                    width: box.width,
                    height: Math.round(element.height * mutiplier)
                };
            }
            else {
                mutiplier = (box.height / element.height);
                return {
                    width: Math.round(element.width * mutiplier),
                    height: box.height
                };
            }
        }
        onClosed() {
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
        async zoomOut(options) {
            if (!this.slide)
                return;
            if (!this.visible)
                return;
            options = options || {};
            this.state = 'closing';
            this.element.classList.add('closing');
            this.cursor && this.cursor.scale(this.cursor.defaultScale);
            this.reactive.trigger({
                type: 'closing',
                element: this.element,
                item: this.slide.item
            });
            this.element.style.cursor = null;
            this.calculateBox(this.item);
            let originBox = this.item.originBox;
            let offsetY = options.offsetY || 0;
            this.slide.resetObjectSrc();
            setStyle(this.slide.objectEl, {
                display: 'block',
                position: 'absolute',
                top: '0',
                left: '0',
                width: originBox.width + 'px',
                height: originBox.height + 'px',
                transformOrigin: 'left top',
                transition: null,
                maxHeight: null,
                maxWidth: null,
                transform: `translateX(${this.fittedBox.left}px) translateY(${this.fittedBox.top + offsetY}px) scale(${this.scale})`
            });
            this.visible = false;
            this.animating = true;
            this.element.style.background = 'transparent';
            this.animation && this.animation.pause();
            await this.animateBackToOrigin(this.options.zoomOutDuration, this.options.zoomOutEasing).finished;
            this.animating = false;
            this.animation = null;
            this.onClosed();
        }
        animateBackToOrigin(duration, easing = 'easeOutQuad') {
            let objectEl = this.slide.objectEl;
            this.animation && this.animation.pause();
            this.calculateBox(objectEl.getBoundingClientRect());
            this.scrollTop = document.body.scrollTop;
            let originBox = this.item.originBox;
            let targets = [objectEl];
            this.animation = anime({
                targets: targets,
                duration: duration,
                scale: originBox.width / objectEl.clientWidth,
                translateX: originBox.left,
                translateY: originBox.top,
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
                position: 'fixed',
                top: '0',
                right: '0',
                bottom: '0',
                left: '0',
                zIndex: '100',
                visibility: 'hidden',
                userSelect: 'none'
            });
            let backgroundEl = document.createElement('div');
            backgroundEl.classList.add('background');
            setStyle(backgroundEl, {
                position: 'absolute',
                width: '100%',
                height: '100%',
                top: '0px',
                left: '0px'
            });
            let viewportEl = document.createElement('div');
            viewportEl.className = 'viewport';
            setStyle(viewportEl, {
                overflow: 'hidden',
                position: 'relative',
                width: '100%',
                height: '100%',
                userSelect: 'none'
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
    Carbon.Lightbox = Lightbox;
    class Viewport {
        constructor(element) {
            this.reactive = new Carbon.Reactive();
            this.element = element;
            this.element.style.cursor = 'grab';
            this.padding = {
                top: 25,
                right: 25,
                bottom: 25,
                left: 25
            };
            this.gestures = new Carbon.Gestures.Manager(this.element);
            this.gestures.add(new Carbon.Gestures.Pan({ threshold: 3, pointers: 0 }));
            this.gestures.add(new Carbon.Gestures.Tap());
            this.gestures.on("pinchstart pinchmove", this.onPinch.bind(this));
            this.gestures.on("panstart", this.onPanStart.bind(this));
            this.gestures.on("panmove", this.onPanMove.bind(this));
            this.gestures.on("panend", this.onPanEnd.bind(this));
            this.gestures.on("tap", this.onTap.bind(this));
        }
        onPinch(e) {
            this.reactive.trigger('pinch', e);
        }
        onTap(e) {
            this.reactive.trigger('tap', e);
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
            return (this.element.clientWidth - this.padding.left - this.padding.right);
        }
        get height() {
            return (this.element.clientHeight);
        }
        get width() {
            return (this.element.clientWidth);
        }
        get bounds() {
            return this.element.getBoundingClientRect();
        }
        get offset() {
            return this.content.offset;
        }
        setSize(width, height) {
            this.element.style.width = width + 'px';
            this.element.style.height = height + 'px';
            this.content.relativeScale = new LinearScale([this.content.calculateMinScale(), 1]);
        }
        setOffset(offset) {
            offset = this.clamp(offset);
            this.content._setOffset(offset);
        }
        clamp(offset) {
            if (offset.x > 0) {
                offset.x = 0;
            }
            if (offset.y > 0) {
                offset.y = 0;
            }
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
        centerAt(anchor) {
            let x = this.content.width * anchor.x;
            let y = this.content.height * anchor.y;
            this.setOffset({
                x: -(((x * 2) - this.width) / 2),
                y: -(((y * 2) - this.height) / 2)
            });
        }
    }
    class Slide {
        constructor(element) {
            this.x = 0;
            this.y = 0;
            this.element = element;
        }
        reset() {
            this.element.style.transform = null;
            this.element.style.transition = null;
        }
        resetObjectSrc() {
            let sourceImg = this.item.sourceElement.closest('img') || this.item.sourceElement.querySelector('img');
            if (sourceImg && this.objectEl instanceof HTMLImageElement) {
                this.objectEl.removeAttribute('srcset');
                this.objectEl.src = sourceImg.src;
                this.objectEl.srcset = sourceImg.src + ' 1x';
                this.objectEl.style.imageRendering = 'pixelated';
            }
        }
        get index() {
            return this.item.index;
        }
        deactivate() {
        }
        activate() {
        }
        destroy() {
            this.element.remove();
        }
        get objectEl() {
            return this.element.querySelector('.clone');
        }
        fitObject() {
            let el = this.objectEl;
            if (!el)
                return;
            el.removeAttribute('style');
            if (el.tagName == 'IMG' || el.tagName == 'VIDEO') {
                el.style.height = 'auto';
                el.style.width = 'auto';
                el.style.maxWidth = '100%';
                el.style.maxHeight = '100%';
                el.width = this.item.width;
                el.height = this.item.height;
            }
            el.style.willChange = null;
            el.style.userSelect = 'none';
            el.removeAttribute('data-zoom-src');
            el.removeAttribute('data-zoom-size');
        }
        static create(item) {
            let element = document.createElement('carbon-slide');
            var slide = new Slide(element);
            slide.item = item;
            slide.element.style.setProperty('--index', item.index.toString());
            return slide;
        }
    }
    class LightboxItem {
        constructor(sourceElement) {
            this.index = 0;
            this.sourceElement = sourceElement;
            let { zoomSize } = sourceElement.dataset;
            if (zoomSize) {
                let parts = zoomSize.split('x');
                this.width = parseInt(parts[0], 10);
                this.height = parseInt(parts[1], 10);
            }
            let indexEl = this.sourceElement.closest('[data-index]');
            if (indexEl) {
                this.index = parseInt(indexEl.dataset['index']);
            }
        }
        get originBox() {
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
    Carbon.LightboxItem = LightboxItem;
    class ViewportContent {
        constructor(element, viewport) {
            this._scale = 1;
            this.offset = new Point(0, 0);
            if (!element)
                throw new Error("element is null");
            if (!viewport)
                throw new Error("viewport is null");
            this.element = element;
            this.viewport = viewport;
            this.element.style.transformOrigin = '0 0';
            this.relativeScale = new LinearScale([this.calculateMinScale(), 1]);
        }
        calculateMinScale() {
            let percentW = this.viewport.width / this.width;
            let percentH = this.viewport.height / this.height;
            return (percentH < percentW)
                ? percentW
                : percentH;
        }
        get x() { return this.offset.x; }
        get y() { return this.offset.y; }
        get width() { return this.element.scrollWidth * this.scale; }
        get height() { return this.element.scrollHeight * this.scale; }
        get scale() {
            return this._scale;
        }
        set scale(value) {
            this._scale = value;
            this.update();
        }
        _setOffset(offset) {
            this.offset = offset;
            this.update();
        }
        setRelativeScale(value) {
            if (value > 1)
                return;
            this.scale = this.relativeScale.getValue(value);
            let anchor = this.viewport.anchorPoint;
            this.viewport.centerAt(anchor);
        }
        update() {
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
    class Pannable {
        constructor(element, viewport) {
            this.dragging = false;
            if (!element)
                throw new Error("element is null");
            this.element = element;
            this.viewport = viewport || new Viewport(this.element.closest('.viewport'));
            this.viewport.content = new ViewportContent(this.element, this.viewport);
            this.content = this.viewport.content;
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
        center(ev) {
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
            if (!this.enabled)
                return false;
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
            if (!this.enabled)
                return false;
            this.viewport.setOffset({
                x: this.position.x + ev.deltaX,
                y: this.position.y + ev.deltaY
            });
        }
    }
    Carbon.Pannable = Pannable;
    class Point {
        constructor(x, y) {
            this.x = x;
            this.y = y;
        }
    }
    class LinearScale {
        constructor(domain) {
            this.domain = domain || [0, 1];
            this.range = [0, 1];
        }
        getValue(value) {
            let lower = this.domain[0];
            let upper = this.domain[1];
            let dif = upper - lower;
            return lower + (value * dif);
        }
    }
    class Deferred {
        constructor() {
            this.promise = new Promise((resolve, reject) => {
                this._resolve = resolve;
                this._reject = reject;
            });
        }
        resolve(value) {
            this._resolve(value);
        }
        reject(value) {
            this._reject(value);
        }
    }
})(Carbon || (Carbon = {}));
Carbon.controllers.set('zoom', {
    in(e) {
        if (e.target.closest('carbon-indicator, .hovering'))
            return;
        let lightbox = Carbon.Lightbox.get({ cursor: window.cursor });
        lightbox.open(e.target);
        window.lightbox = lightbox;
    }
});
