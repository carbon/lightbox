"use strict";
var Carbon;
(function (Carbon) {
    function setStyle(element, data) {
        for (var _i = 0, _a = Object.keys(data); _i < _a.length; _i++) {
            var key = _a[_i];
            element.style[key] = data[key];
        }
    }
    var Lightbox = (function () {
        function Lightbox(options) {
            if (options === void 0) { options = null; }
            var _this = this;
            this.padding = 25;
            this.visible = false;
            this.animating = false;
            this.animationDuration = 200;
            this.state = 'closed';
            this.easing = 'cubic-bezier(.175,.885,.32,1)';
            this.didPan = false;
            this.element = this.createElement();
            this.viewport = new Viewport(this.element.querySelector('.viewport'));
            window.addEventListener('scroll', this.onScroll.bind(this), false);
            document.addEventListener('keyup', function (e) {
                if (e.keyCode !== 27)
                    return;
                if (_this.pannable && _this.pannable.enabled) {
                    _this.pannable.reset();
                    _this.pannable.disable();
                }
                else {
                    _this.zoomOut();
                }
            });
            this.options = options || {};
            this.viewport.element.addEventListener('click', this.onTap.bind(this), true);
            this.viewport.on('panstart', this.onPanStart.bind(this));
            this.viewport.on('panmove', this.onPanMove.bind(this));
            this.viewport.on('panend', this.onPanEnd.bind(this));
        }
        Lightbox.get = function () {
            return Lightbox.instance || (Lightbox.instance = new Lightbox());
        };
        Lightbox.prototype.open = function (sourceElement) {
            this.scrollTop = document.body.scrollTop;
            if (this.visible)
                return;
            this.sourceElement = sourceElement;
            if (this.animating)
                return;
            this.origin = this.sourceElement.getBoundingClientRect();
            this.scale = 0;
            var data = sourceElement.dataset;
            this.item = new LightboxItem();
            this.item.url = data['zoomSrc'];
            if (data['zoomSize']) {
                var parts = data['zoomSize'].split('x');
                this.item.width = parseInt(parts[0], 10);
                this.item.height = parseInt(parts[1], 10);
            }
            else {
                this.item.width = parseInt(data['zoomWidth'], 10);
                this.item.height = parseInt(data['zoomHeight'], 10);
            }
            this.createClone();
            this.visible = true;
            this.element.classList.add('open');
            this.element.classList.remove('closed');
            this.element.style.visibility = 'visible';
            this.element.style.cursor = 'zoom-out';
            this.pannable = new Carbon.Pannable(this.cloneEl, this.viewport);
            this.sourceElement.style.visibility = 'hidden';
            this.cloneEl.style['will-change'] = 'transform';
            this.zoomIn();
        };
        Lightbox.prototype.onPanEnd = function (e) {
            var _this = this;
            if (this.pannable.enabled || this.pannable.dragging)
                return;
            this.didPan = true;
            if (this.panDirection == 4 || this.panDirection == 2) {
                this.viewport.element.style.transform = 'translateY(0px)';
                return;
            }
            this.cloneEl.style.transition = null;
            this.panDirection = null;
            console.log('pan end', e.deltaY);
            if (Math.abs(e.deltaY) > 150) {
                this.animating = true;
                this.viewport.element.style.transition = "transform 50ms " + this.easing;
                this.viewport.element.style.transform = "translateY(0px)";
                setTimeout(function () {
                    _this.zoomOut();
                }, 50);
            }
            else {
                this.element.style.setProperty('--background-opacity', '1');
                this.viewport.element.style.transition = "transform 200ms ease-in";
                this.viewport.element.style.transform = "translateY(0px)";
                this.element.style.transform = null;
            }
        };
        Lightbox.prototype.onPanStart = function (e) {
            if (this.pannable.enabled)
                return;
            this.panDirection = e.offsetDirection;
            this.fitObject();
        };
        Lightbox.prototype.onPanMove = function (e) {
            if (this.pannable.enabled)
                return;
            this.viewport.element.style.transition = '';
            var transform = '';
            if (this.panDirection == 16 || this.panDirection == 8) {
                var backgroundOpacity = 1 - Math.abs(e.deltaY / (this.height / 2));
                this.element.style.setProperty('--background-opacity', backgroundOpacity.toString());
            }
            switch (this.panDirection) {
                case 16:
                case 8:
                    transform = "translateY(" + e.deltaY + "px)";
                    break;
                case 4:
                case 2:
                    transform = "translateX(" + e.deltaX + "px)";
                    break;
            }
            this.viewport.element.style.transform = transform;
        };
        Object.defineProperty(Lightbox.prototype, "isPannable", {
            get: function () {
                return this.cloneEl.classList.contains('pannable');
            },
            enumerable: true,
            configurable: true
        });
        Lightbox.prototype.onTap = function (e) {
            var _this = this;
            if (this.didPan) {
                this.didPan = false;
                return;
            }
            console.log('tap', this.pannable.dragging);
            if (this.animating || this.pannable.dragging || this.panDirection) {
                return;
            }
            var maxScale = this.item.width / this.fittedBox.width;
            var canPan = this.isPannable && maxScale > 1;
            if (!canPan) {
                this.zoomOut();
                return;
            }
            if (this.pannable.enabled) {
                this.pannable.content._scale = 1;
                this.cloneEl.style.transition = "transform 250ms " + this.easing;
                this.cloneEl.style.transform = "scale(1) translate(" + this.fittedBox.left + "px, " + this.fittedBox.top + "px)";
                this.pannable.disable();
                this.state = 'opened';
                return;
            }
            this.state = 'panning';
            this.fitObject();
            this.calculateTargetPosition(this.item);
            var l = e.offsetX - this.fittedBox.left + 25;
            var t = e.offsetY - this.fittedBox.top + 25;
            var anchor = {
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
            this.cloneEl.style.transform = "scale(1) translate(" + this.fittedBox.left + "px, " + this.fittedBox.top + "px)";
            setTimeout(function () {
                _this.cloneEl.style.transition = "transform 250ms " + _this.easing;
                _this.pannable.content._scale = _this.item.width / _this.fittedBox.width;
                _this.pannable.viewport.centerAt(anchor);
            }, 15);
        };
        Lightbox.prototype.createClone = function () {
            var a = this.element.querySelector('.clone');
            a && a.remove();
            var cloneEl = this.sourceElement.cloneNode(true);
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
                transform: "translate(" + this.origin.left + "px, " + this.origin.top + "px) scale(1)"
            });
            cloneEl.draggable = false;
            cloneEl.classList.add('clone');
            cloneEl.classList.remove('zoomable');
            cloneEl.removeAttribute('on-click');
            this.viewport.element.appendChild(cloneEl);
            this.calculateTargetPosition(this.item);
            this.cloneEl = cloneEl;
        };
        Lightbox.prototype.resetCloneStyle = function () {
            setStyle(this.cloneEl, {
                display: 'block',
                position: 'absolute',
                top: '0',
                left: '0',
                pointerEvents: 'none',
                width: this.origin.width + 'px',
                height: this.origin.height + 'px',
                transformOrigin: 'left top'
            });
            this.calculateTargetPosition(this.item);
            this.cloneEl.style.transform = "translate(" + this.fittedBox.left + "px," + this.fittedBox.top + "px) scale(" + this.scale + ")";
        };
        Lightbox.prototype.calculateTargetPosition = function (elementSize) {
            this.origin = this.sourceElement.getBoundingClientRect();
            var size = this.fit(elementSize, {
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
        };
        Lightbox.prototype.onScroll = function () {
            if (!this.sourceElement)
                return;
            if (this.animating) {
                this.calculateTargetPosition(this.item);
                var elapsed = new Date() - this.animationStart;
                this.cloneEl.style.transition = "transform " + (this.animationDuration - elapsed) + "ms ease-out";
                this.cloneEl.style.transform = "translate(" + this.origin.left + "px," + this.origin.top + "px) scale(" + this.origin.width / this.cloneEl.clientWidth + ")";
            }
            if (this.visible && Math.abs(this.scrollTop - window.scrollY) > 15) {
                this.zoomOut();
            }
        };
        Lightbox.prototype.zoomIn = function (duration) {
            var _this = this;
            if (duration === void 0) { duration = '0.25s'; }
            this.element.style.setProperty('--background-opacity', '1');
            this.viewport.element.style.transform = null;
            var animated = new Deferred();
            this.element.classList.add('opening');
            this.state = 'opening';
            this.cloneEl.style.transition = "transform " + duration + " " + this.easing;
            this.cloneEl.style.transform = "translate(" + this.fittedBox.left + "px," + this.fittedBox.top + "px) scale(" + this.scale + ")";
            var otherImg = this.cloneEl.tagName == 'IMG'
                ? this.cloneEl
                : this.cloneEl.querySelector('img');
            if (otherImg) {
                this.item.load().then(function () {
                    animated.promise.then(function () {
                        setTimeout(function () {
                            console.log('better image', _this.state);
                            if (!(_this.state == 'opening' || _this.state == 'opened')) {
                                return;
                            }
                            otherImg.srcset = _this.item.url + ' 1x';
                            _this.fitObject();
                        }, 1);
                    });
                });
            }
            setTimeout(function () {
                animated.resolve(true);
                _this.element.classList.remove('opening');
            }, 251);
            return animated;
        };
        Lightbox.prototype.fitObject = function () {
            this.cloneEl.removeAttribute('style');
            this.cloneEl.style.width = '100%';
            this.cloneEl.style.userSelect = 'none';
            this.cloneEl.style.objectFit = 'scale-down';
            this.cloneEl.draggable = false;
            this.cloneEl.style.pointerEvents = 'none';
        };
        Lightbox.prototype.fit = function (element, box) {
            if (element.height <= box.height && element.width <= box.width) {
                return { width: element.width, height: element.height };
            }
            var mutiplier = (box.width / element.width);
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
        };
        Lightbox.prototype.onClosed = function () {
            this.element.classList.remove('open', 'closing');
            this.element.classList.add('closed');
            this.element.style.background = '';
            this.state = 'closed';
            this.sourceElement.style.visibility = 'visible';
            this.animating = false;
            this.cloneEl.remove();
        };
        Lightbox.prototype.zoomOut = function () {
            var _this = this;
            this.state = 'closing';
            this.cloneEl.style.transition = null;
            this.resetCloneStyle();
            if (!this.visible)
                return;
            this.animating = true;
            this.element.style.cursor = null;
            this.element.classList.add('closing');
            this.visible = false;
            this.calculateTargetPosition(this.cloneEl.getBoundingClientRect());
            this.animating = true;
            this.element.style.background = 'transparent';
            this.cloneEl.style.transition = "transform " + this.animationDuration + "ms ease-out";
            this.cloneEl.style.transform = "translate(" + this.origin.left + "px," + this.origin.top + "px) scale(" + this.origin.width / this.cloneEl.clientWidth + ")";
            this.animationStart = new Date();
            setTimeout(function () {
                _this.animating = false;
                _this.onClosed();
            }, this.animationDuration + 3);
        };
        Object.defineProperty(Lightbox.prototype, "width", {
            get: function () {
                return this.element.clientWidth;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Lightbox.prototype, "height", {
            get: function () {
                return this.element.clientHeight;
            },
            enumerable: true,
            configurable: true
        });
        Lightbox.prototype.close = function () {
            this.element.classList.add('closed');
            this.element.classList.remove('open');
        };
        Lightbox.prototype.createElement = function () {
            var element = document.createElement('div');
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
            var backgroundEl = document.createElement('div');
            backgroundEl.classList.add('background');
            setStyle(backgroundEl, {
                position: 'absolute',
                width: '100%',
                height: '100%',
                top: '0px',
                left: '0px'
            });
            var viewportEl = document.createElement('div');
            viewportEl.className = 'viewport';
            setStyle(viewportEl, {
                display: 'flex',
                overflow: 'hidden',
                position: 'absolute',
                width: '100%',
                height: '100%',
                top: '0px',
                left: '0px',
                padding: 25 + 'px',
                boxSizing: 'border-box',
                justifyContent: 'center',
                userSelect: 'none'
            });
            element.appendChild(backgroundEl);
            element.appendChild(viewportEl);
            document.body.appendChild(element);
            return element;
        };
        return Lightbox;
    }());
    Carbon.Lightbox = Lightbox;
    var Viewport = (function () {
        function Viewport(element) {
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
        Viewport.prototype.onPinch = function (e) {
            this.reactive.trigger('pinch', e);
        };
        Viewport.prototype.onPanStart = function (e) {
            var a = { type: 'panstart' };
            Object.assign(a, e);
            this.reactive.trigger(a);
        };
        Viewport.prototype.onPanMove = function (e) {
            var a = { type: 'panmove' };
            Object.assign(a, e);
            this.reactive.trigger(a);
        };
        Viewport.prototype.onPanEnd = function (e) {
            var a = { type: 'panend' };
            Object.assign(a, e);
            this.reactive.trigger(a);
        };
        Viewport.prototype.on = function (type, callback) {
            return this.reactive.on(type, callback);
        };
        Object.defineProperty(Viewport.prototype, "innerHeight", {
            get: function () {
                return (this.element.clientHeight - this.padding.top - this.padding.bottom);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Viewport.prototype, "innerWidth", {
            get: function () {
                return (this.element.clientWidth - this.padding.left - this.padding.right);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Viewport.prototype, "height", {
            get: function () {
                return (this.element.clientHeight);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Viewport.prototype, "width", {
            get: function () {
                return (this.element.clientWidth);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Viewport.prototype, "bounds", {
            get: function () {
                return this.element.getBoundingClientRect();
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Viewport.prototype, "offset", {
            get: function () {
                return this.content.offset;
            },
            enumerable: true,
            configurable: true
        });
        Viewport.prototype.setSize = function (width, height) {
            this.element.style.width = width + 'px';
            this.element.style.height = height + 'px';
            this.content.relativeScale = new LinearScale([this.content.calculateMinScale(), 1]);
        };
        Viewport.prototype.setOffset = function (offset) {
            offset = this.clamp(offset);
            this.content._setOffset(offset);
        };
        Viewport.prototype.clamp = function (offset) {
            if (offset.x > 0) {
                offset.x = 0;
            }
            if (offset.y > 0) {
                offset.y = 0;
            }
            var xOverflow = this.content.width - this.width;
            var yOverflow = this.content.height - this.height;
            if (-offset.x > xOverflow) {
                offset.x = -xOverflow;
            }
            if (-offset.y > yOverflow) {
                offset.y = -yOverflow;
            }
            return offset;
        };
        Viewport.prototype.centerAt = function (anchor) {
            var x = this.content.width * anchor.x;
            var y = this.content.height * anchor.y;
            this.setOffset({
                x: -(((x * 2) - this.width) / 2),
                y: -(((y * 2) - this.height) / 2)
            });
        };
        return Viewport;
    }());
    var LightboxItem = (function () {
        function LightboxItem() {
        }
        LightboxItem.prototype.load = function () {
            console.log('loading:', this.url);
            var deferred = new Deferred();
            this.image = new Image();
            this.image.onload = function () {
                deferred.resolve();
            };
            this.image.src = this.url;
            return deferred.promise;
        };
        return LightboxItem;
    }());
    var ViewportContent = (function () {
        function ViewportContent(element, viewport) {
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
        ViewportContent.prototype.calculateMinScale = function () {
            var percentW = this.viewport.width / this.width;
            var percentH = this.viewport.height / this.height;
            return (percentH < percentW)
                ? percentW
                : percentH;
        };
        Object.defineProperty(ViewportContent.prototype, "x", {
            get: function () { return this.offset.x; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ViewportContent.prototype, "y", {
            get: function () { return this.offset.y; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ViewportContent.prototype, "width", {
            get: function () { return this.element.scrollWidth * this.scale; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ViewportContent.prototype, "height", {
            get: function () { return this.element.scrollHeight * this.scale; },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ViewportContent.prototype, "scale", {
            get: function () {
                return this._scale;
            },
            set: function (value) {
                this._scale = value;
                this.update();
            },
            enumerable: true,
            configurable: true
        });
        ViewportContent.prototype._setOffset = function (offset) {
            this.offset = offset;
            this.update();
        };
        ViewportContent.prototype.setRelativeScale = function (value) {
            if (value > 1)
                return;
            this.scale = this.relativeScale.getValue(value);
            var anchor = this.viewport.anchorPoint;
            this.viewport.centerAt(anchor);
        };
        ViewportContent.prototype.update = function () {
            console.log(this.viewport.width, this.width);
            if (this.width < this.viewport.width) {
                this.offset.x = (this.viewport.width - this.width) / 2;
            }
            if (this.height < this.viewport.height) {
                this.offset.y = (this.viewport.height - this.height) / 2;
            }
            this.element.style.transformOrigin = '0 0';
            this.element.style.transform = "translate(" + this.x + "px, " + this.y + "px) scale(" + this.scale + ")";
        };
        return ViewportContent;
    }());
    var Pannable = (function () {
        function Pannable(element, viewport) {
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
        Pannable.prototype.enable = function () {
            this.enabled = true;
        };
        Pannable.prototype.disable = function () {
            this.enabled = false;
        };
        Pannable.prototype.onPinch = function (ev) {
            console.log('pinch');
        };
        Pannable.prototype.center = function (ev) {
            this.viewport.centerAt({ x: 0.5, y: 0.5 });
            this.position = this.content.offset;
        };
        Pannable.prototype.update = function () {
        };
        Pannable.prototype.reset = function () {
            this.element.classList.add('animate');
            this.element.draggable = false;
            this.center();
            this.update();
        };
        Pannable.prototype.onStart = function (ev) {
            if (!this.enabled)
                return false;
            this.content.element.style.transition = null;
            this.position = this.content.offset;
            this.dragging = true;
            this.element.style.cursor = 'grabbing';
        };
        Pannable.prototype.onEnd = function (ev) {
            var _this = this;
            setTimeout(function () {
                _this.dragging = false;
            }, 1);
            this.element.style.cursor = null;
        };
        Pannable.prototype.onDrag = function (ev) {
            if (!this.enabled)
                return false;
            console.log('DRAGGING PAN');
            this.viewport.setOffset({
                x: this.position.x + ev.deltaX,
                y: this.position.y + ev.deltaY
            });
        };
        return Pannable;
    }());
    Carbon.Pannable = Pannable;
    var Point = (function () {
        function Point(x, y) {
            this.x = x;
            this.y = y;
        }
        return Point;
    }());
    var LinearScale = (function () {
        function LinearScale(domain) {
            this.domain = domain || [0, 1];
            this.range = [0, 1];
        }
        LinearScale.prototype.getValue = function (value) {
            var lower = this.domain[0];
            var upper = this.domain[1];
            var dif = upper - lower;
            return lower + (value * dif);
        };
        return LinearScale;
    }());
    var Deferred = (function () {
        function Deferred() {
            var _this = this;
            this.promise = new Promise(function (resolve, reject) {
                _this._resolve = resolve;
                _this._reject = reject;
            });
        }
        Deferred.prototype.resolve = function (value) {
            this._resolve(value);
        };
        Deferred.prototype.reject = function (value) {
            this._reject(value);
        };
        return Deferred;
    }());
})(Carbon || (Carbon = {}));
Carbon.controllers.set('zoom', {
    in: function (e) {
        if (e.target.closest('carbon-indicator, .hovering'))
            return;
        Carbon.Lightbox.get().open(e.target);
    }
});
