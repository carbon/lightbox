"use strict";
var Carbon;
(function (Carbon) {
    function setStyle(element, data) {
        for (var key of Object.keys(data)) {
            element.style[key] = data[key];
        }
    }
    const styles = `
carbon-lightbox {
  user-select: none;
  -webkit-user-select: none;
}

carbon-lightbox carbon-slide {
  display: flex;
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
}

`;
    class Lightbox {
        constructor(options = null) {
            this.padding = 25;
            this.visible = false;
            this.animating = false;
            this.animationDuration = 200;
            this.state = 'closed';
            this.easing = 'cubic-bezier(.175,.885,.32,1)';
            this.didPan = false;
            this.reactive = new Carbon.Reactive();
            this.isSlideshow = false;
            this.didScroll = false;
            this.element = this.createElement();
            this.viewport = new Viewport(this.element.querySelector('.viewport'));
            window.addEventListener('scroll', this.onScroll.bind(this), false);
            window.addEventListener('resize', this.onResize.bind(this), false);
            document.addEventListener('keyup', e => {
                if (e.keyCode !== 27)
                    return;
                if (this.pannable && this.pannable.enabled) {
                    this.pannable.reset();
                    this.pannable.disable();
                }
                else {
                    this.zoomOut();
                }
            });
            this.options = options || {};
            this.cursor = options.cursor;
            if (this.cursor) {
                this.viewport.element.style.cursor = 'none';
                this.cursor.on('move', this.onCursorMove.bind(this));
            }
            this.viewport.element.addEventListener('click', this.onTap.bind(this), true);
            this.viewport.on('panstart', this.onPanStart.bind(this));
            this.viewport.on('panmove', this.onPanMove.bind(this));
            this.viewport.on('panend', this.onPanEnd.bind(this));
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
        async onCursorMove(e) {
            if (!this.visible || this.state == 'opening')
                return;
            let distanceFromRight = document.body.clientWidth - e.clientX;
            let distanceFromBottom = document.body.clientHeight - e.clientY;
            let nearTop = e.clientY < 200;
            let nearBottom = distanceFromBottom < 200;
            if (this.isSlideshow) {
                if (distanceFromRight < 300 && !nearTop && !nearBottom) {
                    await this.cursor.toRightArrow();
                    return;
                }
                else if (e.clientX < 300 && !nearTop && !nearBottom) {
                    await this.cursor.toLeftArrow();
                    return;
                }
            }
            if (e.target && e.target.classList.contains('box')) {
                await this.cursor.toZoomOut();
            }
            else {
                await this.cursor.toClose();
            }
        }
        open(sourceElement) {
            if (this.animating || this.visible) {
                return;
            }
            this.reactive.trigger({
                type: 'open',
                element: this.element
            });
            if (this.cursor) {
                this.cursor.show();
                this.cursor.mode = 'manual';
            }
            else {
                this.element.style.cursor = 'zoom-out';
            }
            this.sourceElement = sourceElement;
            this.origin = this.sourceElement.getBoundingClientRect();
            this.scale = 0;
            let { zoomSrc, zoomSize } = sourceElement.dataset;
            this.item = new LightboxItem(zoomSrc);
            if (zoomSize) {
                let parts = zoomSize.split('x');
                this.item.width = parseInt(parts[0], 10);
                this.item.height = parseInt(parts[1], 10);
            }
            this.createClone();
            this.visible = true;
            this.element.classList.add('open');
            this.element.classList.remove('closed');
            this.element.style.visibility = 'visible';
            this.pannable = new Carbon.Pannable(this.cloneEl, this.viewport);
            this.sourceElement.style.visibility = 'hidden';
            this.cloneEl.style['will-change'] = 'transform';
            this.zoomIn();
        }
        onPanEnd(e) {
            if (this.pannable.enabled || this.pannable.dragging)
                return;
            this.cursor && this.cursor.show();
            this.didPan = true;
            if (this.panDirection == 4 || this.panDirection == 2) {
                this.slide.element.style.transform = null;
                return;
            }
            this.cloneEl.style.transition = null;
            this.panDirection = null;
            if (Math.abs(e.deltaY) > 150) {
                this.animating = true;
                this.slide.element.style.transition = `transform 50ms ${this.easing}`;
                this.slide.element.style.transform = `translateY(0px)`;
                setTimeout(this.zoomOut.bind(this), 50);
            }
            else {
                this.element.style.setProperty('--background-opacity', '1');
                this.slide.element.style.transition = `transform 200ms ease-in`;
                this.slide.element.style.transform = `translateY(0px)`;
                this.element.style.transform = null;
            }
        }
        onPanStart(e) {
            if (this.animating || this.pannable.enabled)
                return;
            this.panDirection = e.offsetDirection;
            this.cursor && this.cursor.hide();
            this.fitObject();
        }
        onPanMove(e) {
            if (this.animating || this.pannable.enabled) {
                return;
            }
            this.slide.element.style.transition = '';
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
            this.slide.element.style.transform = transform;
        }
        get isPannable() {
            return this.cloneEl.classList.contains('pannable');
        }
        async onTap(e) {
            if (this.animating)
                return;
            if (this.cursor) {
                if (this.cursor.type == 'right-arrow' || this.cursor.type == 'left-arrow') {
                    await anime({
                        targets: this.viewport.element,
                        translateX: this.cursor.type == 'right-arrow' ? -this.viewport.width : this.viewport.width,
                        easing: 'cubicBezier(0.4, 0.0, 0.2, 1)',
                        duration: 300
                    });
                    return;
                }
            }
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
            if (this.pannable.enabled) {
                this.pannable.content._scale = 1;
                this.cloneEl.style.transition = `transform 250ms ${this.easing}`;
                this.cloneEl.style.transform = `scale(1) translateX(${this.fittedBox.left}px) translateY(${this.fittedBox.top}px)`;
                this.pannable.disable();
                this.state = 'opened';
                return;
            }
            this.state = 'panning';
            this.fitObject();
            this.calculateTargetPosition(this.item);
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
            this.cloneEl.style.transform = `scale(1) translateX(${this.fittedBox.left}px) translateY(${this.fittedBox.top}px)`;
            setTimeout(() => {
                this.cloneEl.style.transition = `transform 250ms ${this.easing}`;
                this.pannable.content._scale = this.item.width / this.fittedBox.width;
                this.pannable.viewport.centerAt(anchor);
            }, 15);
        }
        createClone() {
            let a = this.element.querySelector('.clone');
            a && a.remove();
            let cloneEl = this.sourceElement.cloneNode(true);
            if (cloneEl.tagName == 'CARBON-IMAGE' && cloneEl.querySelector('img')) {
                cloneEl = cloneEl.querySelector('img');
            }
            cloneEl.removeAttribute('style');
            setStyle(cloneEl, {
                display: 'block',
                position: 'absolute',
                top: '0',
                left: '0',
                pointerEvents: 'none',
                width: this.origin.width + 'px',
                height: this.origin.height + 'px',
                transformOrigin: 'left top',
                transform: `translateX(${this.origin.left}px) translateY(${this.origin.top}px) scale(1)`
            });
            cloneEl.draggable = false;
            cloneEl.classList.add('clone');
            cloneEl.classList.remove('zoomable');
            cloneEl.removeAttribute('on-click');
            let slide = Slide.create({});
            slide.element.appendChild(cloneEl);
            this.viewport.element.appendChild(slide.element);
            this.calculateTargetPosition(this.item);
            this.slide = slide;
            this.cloneEl = cloneEl;
        }
        resetCloneStyle() {
            this.calculateTargetPosition(this.item);
            setStyle(this.cloneEl, {
                display: 'block',
                position: 'absolute',
                top: '0',
                left: '0',
                pointerEvents: 'none',
                width: this.origin.width + 'px',
                height: this.origin.height + 'px',
                transformOrigin: 'left top',
                transition: null,
                transform: `translateX(${this.fittedBox.left}px) translateY(${this.fittedBox.top}px) scale(${this.scale})`
            });
        }
        calculateTargetPosition(elementSize) {
            this.origin = this.sourceElement.getBoundingClientRect();
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
            this.scale = this.fittedBox.width / this.origin.width;
        }
        onScroll() {
            if (!this.sourceElement)
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
            this.animation = anime({
                targets: this.cloneEl,
                duration: duration,
                translateX: [this.origin.left, this.fittedBox.left],
                translateY: [this.origin.top, this.fittedBox.top],
                scale: [1, this.scale],
                easing: 'easeOutQuad'
            });
            let otherImg = this.cloneEl.tagName == 'IMG'
                ? this.cloneEl
                : this.cloneEl.querySelector('img');
            await this.animation.finished;
            this.animating = false;
            this.animation = null;
            this.state = 'opened';
            if (otherImg) {
                otherImg.onload = () => {
                    this.state == 'opened' && this.fitObject();
                };
                otherImg.decoding = 'sync';
                otherImg.src = this.item.url;
                otherImg.srcset = this.item.url + ' 1x';
            }
            deferred.resolve(true);
            this.element.classList.remove('opening');
            return deferred;
        }
        onResize() {
            this.fitBox();
        }
        fitBox() {
            if (!this.item || !this.sourceElement)
                return;
            if (!this.boxEl) {
                this.addBox();
            }
            this.calculateTargetPosition(this.item);
            this.boxEl.style.transform = `translateX(${this.fittedBox.left}px) translateY(${this.fittedBox.top}px) scale(${this.scale})`;
        }
        fitObject() {
            this.cloneEl.removeAttribute('style');
            this.cloneEl.style.width = '100%';
            this.cloneEl.style.userSelect = 'none';
            this.cloneEl.style.objectFit = 'scale-down';
            this.cloneEl.draggable = false;
            this.cloneEl.style.pointerEvents = 'none';
            this.cloneEl.removeAttribute('data-zoom-src');
            this.cloneEl.removeAttribute('data-zoom-size');
            this.fitBox();
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
            this.sourceElement.style.visibility = 'visible';
            this.animating = false;
            if (this.boxEl) {
                this.boxEl.remove();
                this.boxEl = null;
            }
            if (this.cloneEl) {
                this.cloneEl.remove();
                this.cloneEl = null;
                this.slide = null;
            }
            this.viewport.element.innerHTML = '';
        }
        async zoomOut() {
            if (!this.cloneEl)
                return;
            if (this.cursor) {
                this.cursor.scale(this.cursor.defaultScale);
                if (this.cursor.type == 'close') {
                    this.cursor.element.style.opacity = '0';
                }
                else {
                    this.cursor.toZoomIn();
                }
            }
            this.state = 'closing';
            this.element.style.cursor = null;
            this.cloneEl.style.transition = null;
            this.resetCloneStyle();
            if (!this.visible)
                return;
            this.element.classList.add('closing');
            this.visible = false;
            this.animating = true;
            this.element.style.background = 'transparent';
            this.animation && this.animation.pause();
            await this.animateBackToOrigin(this.animationDuration).finished;
            this.animating = false;
            this.animation = null;
            this.onClosed();
        }
        animateBackToOrigin(duration, easing = 'easeOutQuad') {
            this.animation && this.animation.pause();
            this.calculateTargetPosition(this.cloneEl.getBoundingClientRect());
            this.scrollTop = document.body.scrollTop;
            this.animation = anime({
                targets: this.cloneEl,
                duration: duration,
                scale: this.origin.width / this.cloneEl.clientWidth,
                translateX: this.origin.left,
                translateY: this.origin.top,
                update: (anim) => {
                    let scrollY = this.scrollTop - document.body.scrollTop;
                    let val = parseFloat(anime.get(this.cloneEl, 'translateY', 'px'));
                    anime.set([this.cloneEl], {
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
        addBox() {
            this.boxEl = document.createElement('div');
            this.boxEl.classList.add('box');
            setStyle(this.boxEl, {
                display: 'block',
                position: 'absolute',
                top: '0',
                left: '0',
                width: this.origin.width + 'px',
                height: this.origin.height + 'px',
                transformOrigin: 'left top',
            });
            this.viewport.element.appendChild(this.boxEl);
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
            console.log('pan start!');
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
        setOffset(offset) {
            this.x = offset.x;
            this.y = offset.y;
            this.element.style.transformOrigin = '0 0';
            this.element.style.transform = `translateX(${this.x}px) translateY(${this.y}px))`;
        }
        static create(item) {
            let element = document.createElement('carbon-slide');
            return new Slide(element);
        }
    }
    class LightboxItem {
        constructor(url) {
            this.url = url;
        }
    }
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
            console.log('DRAGGING PAN');
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
    }
});
