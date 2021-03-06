(function () {
	'use strict';

	/** Virtual DOM Node */
	function VNode(nodeName, attributes, children) {
		/** @type {string|function} */
		this.nodeName = nodeName;

		/** @type {object<string>|undefined} */
		this.attributes = attributes;

		/** @type {array<VNode>|undefined} */
		this.children = children;

		/** Reference to the given key. */
		this.key = attributes && attributes.key;
	}

	/** Global options
	 *	@public
	 *	@namespace options {Object}
	 */
	var options = {

		/** If `true`, `prop` changes trigger synchronous component updates.
		 *	@name syncComponentUpdates
		 *	@type Boolean
		 *	@default true
		 */
		//syncComponentUpdates: true,

		/** Processes all created VNodes.
		 *	@param {VNode} vnode	A newly-created VNode to normalize/process
		 */
		//vnode(vnode) { }

		/** Hook invoked after a component is mounted. */
		// afterMount(component) { }

		/** Hook invoked after the DOM is updated with a component's latest render. */
		// afterUpdate(component) { }

		/** Hook invoked immediately before a component is unmounted. */
		// beforeUnmount(component) { }
	};

	var stack = [];

	var EMPTY_CHILDREN = [];

	/** JSX/hyperscript reviver
	*	Benchmarks: https://esbench.com/bench/57ee8f8e330ab09900a1a1a0
	 *	@see http://jasonformat.com/wtf-is-jsx
	 *	@public
	 *  @example
	 *  /** @jsx h *\/
	 *  import { render, h } from 'preact';
	 *  render(<span>foo</span>, document.body);
	 */
	function h(nodeName, attributes) {
		var arguments$1 = arguments;

		var children, lastSimple, child, simple, i;
		for (i=arguments.length; i-- > 2; ) {
			stack.push(arguments$1[i]);
		}
		if (attributes && attributes.children) {
			if (!stack.length) { stack.push(attributes.children); }
			delete attributes.children;
		}
		while (stack.length) {
			if ((child = stack.pop()) instanceof Array) {
				for (i=child.length; i--; ) { stack.push(child[i]); }
			}
			else if (child!=null && child!==true && child!==false) {
				if (typeof child=='number') { child = String(child); }
				simple = typeof child=='string';
				if (simple && lastSimple) {
					children[children.length-1] += child;
				}
				else {
					(children || (children = [])).push(child);
					lastSimple = simple;
				}
			}
		}

		var p = new VNode(nodeName, attributes || undefined, children || EMPTY_CHILDREN);

		return p;
	}

	/** Copy own-properties from `props` onto `obj`.
	 *	@returns obj
	 *	@private
	 */
	function extend(obj, props) {
		if (props) {
			for (var i in props) { obj[i] = props[i]; }
		}
		return obj;
	}


	/** Fast clone. Note: does not filter out non-own properties.
	 *	@see https://esbench.com/bench/56baa34f45df6895002e03b6
	 */
	function clone(obj) {
		return extend({}, obj);
	}


	/** Get a deep property value from the given object, expressed in dot-notation.
	 *	@private
	 */
	function delve(obj, key) {
		for (var p=key.split('.'), i=0; i<p.length && obj; i++) {
			obj = obj[p[i]];
		}
		return obj;
	}


	/** @private is the given object a Function? */
	function isFunction(obj) {
		return 'function'===typeof obj;
	}


	/** @private is the given object a String? */
	function isString(obj) {
		return 'string'===typeof obj;
	}


	/** Convert a hashmap of CSS classes to a space-delimited className string
	 *	@private
	 */
	function hashToClassName(c) {
		var str = '';
		for (var prop in c) {
			if (c[prop]) {
				if (str) { str += ' '; }
				str += prop;
			}
		}
		return str;
	}


	/** Just a memoized String#toLowerCase */
	var lcCache = {};
	var toLowerCase = function (s) { return lcCache[s] || (lcCache[s] = s.toLowerCase()); };


	/** Call a function asynchronously, as soon as possible.
	 *	@param {Function} callback
	 */
	var resolved = typeof Promise!=='undefined' && Promise.resolve();
	var defer = resolved ? (function (f) { resolved.then(f); }) : setTimeout;

	function cloneElement(vnode, props) {
		return h(
			vnode.nodeName,
			extend(clone(vnode.attributes), props),
			arguments.length>2 ? [].slice.call(arguments, 2) : vnode.children
		);
	}

	// render modes

	var NO_RENDER = 0;
	var SYNC_RENDER = 1;
	var FORCE_RENDER = 2;
	var ASYNC_RENDER = 3;

	var EMPTY = {};

	var ATTR_KEY = typeof Symbol!=='undefined' ? Symbol.for('preactattr') : '__preactattr_';

	// DOM properties that should NOT have "px" added when numeric
	var NON_DIMENSION_PROPS = {
		boxFlex:1, boxFlexGroup:1, columnCount:1, fillOpacity:1, flex:1, flexGrow:1,
		flexPositive:1, flexShrink:1, flexNegative:1, fontWeight:1, lineClamp:1, lineHeight:1,
		opacity:1, order:1, orphans:1, strokeOpacity:1, widows:1, zIndex:1, zoom:1
	};

	// DOM event types that do not bubble and should be attached via useCapture
	var NON_BUBBLING_EVENTS = { blur:1, error:1, focus:1, load:1, resize:1, scroll:1 };

	/** Create an Event handler function that sets a given state property.
	 *	@param {Component} component	The component whose state should be updated
	 *	@param {string} key				A dot-notated key path to update in the component's state
	 *	@param {string} eventPath		A dot-notated key path to the value that should be retrieved from the Event or component
	 *	@returns {function} linkedStateHandler
	 *	@private
	 */
	function createLinkedState(component, key, eventPath) {
		var path = key.split('.');
		return function(e) {
			var t = e && e.target || this,
				state = {},
				obj = state,
				v = isString(eventPath) ? delve(e, eventPath) : t.nodeName ? (t.type.match(/^che|rad/) ? t.checked : t.value) : e,
				i = 0;
			for ( ; i<path.length-1; i++) {
				obj = obj[path[i]] || (obj[path[i]] = !i && component.state[path[i]] || {});
			}
			obj[path[i]] = v;
			component.setState(state);
		};
	}

	/** Managed queue of dirty components to be re-rendered */

	var items = [];

	function enqueueRender(component) {
		if (!component._dirty && (component._dirty = true) && items.push(component)==1) {
			(defer)(rerender);
		}
	}


	function rerender() {
		var p, list = items;
		items = [];
		while ( (p = list.pop()) ) {
			if (p._dirty) { renderComponent(p); }
		}
	}

	/** Check if a VNode is a reference to a stateless functional component.
	 *	A function component is represented as a VNode whose `nodeName` property is a reference to a function.
	 *	If that function is not a Component (ie, has no `.render()` method on a prototype), it is considered a stateless functional component.
	 *	@param {VNode} vnode	A VNode
	 *	@private
	 */
	function isFunctionalComponent(vnode) {
		var nodeName = vnode && vnode.nodeName;
		return nodeName && isFunction(nodeName) && !(nodeName.prototype && nodeName.prototype.render);
	}



	/** Construct a resultant VNode from a VNode referencing a stateless functional component.
	 *	@param {VNode} vnode	A VNode with a `nodeName` property that is a reference to a function.
	 *	@private
	 */
	function buildFunctionalComponent(vnode, context) {
		return vnode.nodeName(getNodeProps(vnode), context || EMPTY);
	}

	/** Check if two nodes are equivalent.
	 *	@param {Element} node
	 *	@param {VNode} vnode
	 *	@private
	 */
	function isSameNodeType(node, vnode) {
		if (isString(vnode)) {
			return node instanceof Text;
		}
		if (isString(vnode.nodeName)) {
			return !node._componentConstructor && isNamedNode(node, vnode.nodeName);
		}
		if (isFunction(vnode.nodeName)) {
			return (node._componentConstructor ? node._componentConstructor===vnode.nodeName : true) || isFunctionalComponent(vnode);
		}
	}


	function isNamedNode(node, nodeName) {
		return node.normalizedNodeName===nodeName || toLowerCase(node.nodeName)===toLowerCase(nodeName);
	}


	/**
	 * Reconstruct Component-style `props` from a VNode.
	 * Ensures default/fallback values from `defaultProps`:
	 * Own-properties of `defaultProps` not present in `vnode.attributes` are added.
	 * @param {VNode} vnode
	 * @returns {Object} props
	 */
	function getNodeProps(vnode) {
		var props = clone(vnode.attributes);
		props.children = vnode.children;

		var defaultProps = vnode.nodeName.defaultProps;
		if (defaultProps) {
			for (var i in defaultProps) {
				if (props[i]===undefined) {
					props[i] = defaultProps[i];
				}
			}
		}

		return props;
	}

	/** Removes a given DOM Node from its parent. */
	function removeNode(node) {
		var p = node.parentNode;
		if (p) { p.removeChild(node); }
	}


	/** Set a named attribute on the given Node, with special behavior for some names and event handlers.
	 *	If `value` is `null`, the attribute/handler will be removed.
	 *	@param {Element} node	An element to mutate
	 *	@param {string} name	The name/key to set, such as an event or attribute name
	 *	@param {any} old	The last value that was set for this name/node pair
	 *	@param {any} value	An attribute value, such as a function to be used as an event handler
	 *	@param {Boolean} isSvg	Are we currently diffing inside an svg?
	 *	@private
	 */
	function setAccessor(node, name, old, value, isSvg) {

		if (name==='className') { name = 'class'; }

		if (name==='class' && value && typeof value==='object') {
			value = hashToClassName(value);
		}

		if (name==='key') ;
		else if (name==='class' && !isSvg) {
			node.className = value || '';
		}
		else if (name==='style') {
			if (!value || isString(value) || isString(old)) {
				node.style.cssText = value || '';
			}
			if (value && typeof value==='object') {
				if (!isString(old)) {
					for (var i in old) { if (!(i in value)) { node.style[i] = ''; } }
				}
				for (var i$1 in value) {
					node.style[i$1] = typeof value[i$1]==='number' && !NON_DIMENSION_PROPS[i$1] ? (value[i$1]+'px') : value[i$1];
				}
			}
		}
		else if (name==='dangerouslySetInnerHTML') {
			if (value) { node.innerHTML = value.__html || ''; }
		}
		else if (name[0]=='o' && name[1]=='n') {
			var l = node._listeners || (node._listeners = {});
			name = toLowerCase(name.substring(2));
			// @TODO: this might be worth it later, un-breaks focus/blur bubbling in IE9:
			// if (node.attachEvent) name = name=='focus'?'focusin':name=='blur'?'focusout':name;
			if (value) {
				if (!l[name]) { node.addEventListener(name, eventProxy, !!NON_BUBBLING_EVENTS[name]); }
			}
			else if (l[name]) {
				node.removeEventListener(name, eventProxy, !!NON_BUBBLING_EVENTS[name]);
			}
			l[name] = value;
		}
		else if (name!=='list' && name!=='type' && !isSvg && name in node) {
			setProperty(node, name, value==null ? '' : value);
			if (value==null || value===false) { node.removeAttribute(name); }
		}
		else {
			var ns = isSvg && name.match(/^xlink\:?(.+)/);
			if (value==null || value===false) {
				if (ns) { node.removeAttributeNS('http://www.w3.org/1999/xlink', toLowerCase(ns[1])); }
				else { node.removeAttribute(name); }
			}
			else if (typeof value!=='object' && !isFunction(value)) {
				if (ns) { node.setAttributeNS('http://www.w3.org/1999/xlink', toLowerCase(ns[1]), value); }
				else { node.setAttribute(name, value); }
			}
		}
	}


	/** Attempt to set a DOM property to the given value.
	 *	IE & FF throw for certain property-value combinations.
	 */
	function setProperty(node, name, value) {
		try {
			node[name] = value;
		} catch (e) { }
	}


	/** Proxy an event to hooked event handlers
	 *	@private
	 */
	function eventProxy(e) {
		return this._listeners[e.type](e);
	}

	/** DOM node pool, keyed on nodeName. */

	var nodes = {};

	function collectNode(node) {
		removeNode(node);

		if (node instanceof Element) {
			node._component = node._componentConstructor = null;

			var name = node.normalizedNodeName || toLowerCase(node.nodeName);
			(nodes[name] || (nodes[name] = [])).push(node);
		}
	}


	function createNode(nodeName, isSvg) {
		var name = toLowerCase(nodeName),
			node = nodes[name] && nodes[name].pop() || (isSvg ? document.createElementNS('http://www.w3.org/2000/svg', nodeName) : document.createElement(nodeName));
		node.normalizedNodeName = name;
		return node;
	}

	/** Queue of components that have been mounted and are awaiting componentDidMount */
	var mounts = [];

	/** Diff recursion count, used to track the end of the diff cycle. */
	var diffLevel = 0;

	/** Global flag indicating if the diff is currently within an SVG */
	var isSvgMode = false;

	/** Global flag indicating if the diff is performing hydration */
	var hydrating = false;

	/** Invoke queued componentDidMount lifecycle methods */
	function flushMounts() {
		var c;
		while ((c=mounts.pop())) {
			if (c.componentDidMount) { c.componentDidMount(); }
		}
	}


	/** Apply differences in a given vnode (and it's deep children) to a real DOM Node.
	 *	@param {Element} [dom=null]		A DOM node to mutate into the shape of the `vnode`
	 *	@param {VNode} vnode			A VNode (with descendants forming a tree) representing the desired DOM structure
	 *	@returns {Element} dom			The created/mutated element
	 *	@private
	 */
	function diff(dom, vnode, context, mountAll, parent, componentRoot) {
		// diffLevel having been 0 here indicates initial entry into the diff (not a subdiff)
		if (!diffLevel++) {
			// when first starting the diff, check if we're diffing an SVG or within an SVG
			isSvgMode = parent && typeof parent.ownerSVGElement!=='undefined';

			// hydration is inidicated by the existing element to be diffed not having a prop cache
			hydrating = dom && !(ATTR_KEY in dom);
		}

		var ret = idiff(dom, vnode, context, mountAll);

		// append the element if its a new parent
		if (parent && ret.parentNode!==parent) { parent.appendChild(ret); }

		// diffLevel being reduced to 0 means we're exiting the diff
		if (!--diffLevel) {
			hydrating = false;
			// invoke queued componentDidMount lifecycle methods
			if (!componentRoot) { flushMounts(); }
		}

		return ret;
	}


	function idiff(dom, vnode, context, mountAll) {
		var ref = vnode && vnode.attributes && vnode.attributes.ref;


		// Resolve ephemeral Pure Functional Components
		while (isFunctionalComponent(vnode)) {
			vnode = buildFunctionalComponent(vnode, context);
		}


		// empty values (null & undefined) render as empty Text nodes
		if (vnode==null) { vnode = ''; }


		// Fast case: Strings create/update Text nodes.
		if (isString(vnode)) {
			// update if it's already a Text node
			if (dom && dom instanceof Text && dom.parentNode) {
				if (dom.nodeValue!=vnode) {
					dom.nodeValue = vnode;
				}
			}
			else {
				// it wasn't a Text node: replace it with one and recycle the old Element
				if (dom) { recollectNodeTree(dom); }
				dom = document.createTextNode(vnode);
			}

			return dom;
		}


		// If the VNode represents a Component, perform a component diff.
		if (isFunction(vnode.nodeName)) {
			return buildComponentFromVNode(dom, vnode, context, mountAll);
		}


		var out = dom,
			nodeName = String(vnode.nodeName),	// @TODO this masks undefined component errors as `<undefined>`
			prevSvgMode = isSvgMode,
			vchildren = vnode.children;


		// SVGs have special namespace stuff.
		// This tracks entering and exiting that namespace when descending through the tree.
		isSvgMode = nodeName==='svg' ? true : nodeName==='foreignObject' ? false : isSvgMode;


		if (!dom) {
			// case: we had no element to begin with
			// - create an element with the nodeName from VNode
			out = createNode(nodeName, isSvgMode);
		}
		else if (!isNamedNode(dom, nodeName)) {
			// case: Element and VNode had different nodeNames
			// - need to create the correct Element to match VNode
			// - then migrate children from old to new

			out = createNode(nodeName, isSvgMode);

			// move children into the replacement node
			while (dom.firstChild) { out.appendChild(dom.firstChild); }

			// if the previous Element was mounted into the DOM, replace it inline
			if (dom.parentNode) { dom.parentNode.replaceChild(out, dom); }

			// recycle the old element (skips non-Element node types)
			recollectNodeTree(dom);
		}


		var fc = out.firstChild,
			props = out[ATTR_KEY];

		// Attribute Hydration: if there is no prop cache on the element,
		// ...create it and populate it with the element's attributes.
		if (!props) {
			out[ATTR_KEY] = props = {};
			for (var a=out.attributes, i=a.length; i--; ) { props[a[i].name] = a[i].value; }
		}

		// Optimization: fast-path for elements containing a single TextNode:
		if (!hydrating && vchildren && vchildren.length===1 && typeof vchildren[0]==='string' && fc && fc instanceof Text && !fc.nextSibling) {
			if (fc.nodeValue!=vchildren[0]) {
				fc.nodeValue = vchildren[0];
			}
		}
		// otherwise, if there are existing or new children, diff them:
		else if (vchildren && vchildren.length || fc) {
			innerDiffNode(out, vchildren, context, mountAll, !!props.dangerouslySetInnerHTML);
		}


		// Apply attributes/props from VNode to the DOM Element:
		diffAttributes(out, vnode.attributes, props);


		// invoke original ref (from before resolving Pure Functional Components):
		if (ref) {
			(props.ref = ref)(out);
		}

		isSvgMode = prevSvgMode;

		return out;
	}


	/** Apply child and attribute changes between a VNode and a DOM Node to the DOM.
	 *	@param {Element} dom		Element whose children should be compared & mutated
	 *	@param {Array} vchildren	Array of VNodes to compare to `dom.childNodes`
	 *	@param {Object} context		Implicitly descendant context object (from most recent `getChildContext()`)
	 *	@param {Boolean} mountAll
	 *	@param {Boolean} absorb		If `true`, consumes externally created elements similar to hydration
	 */
	function innerDiffNode(dom, vchildren, context, mountAll, absorb) {
		var originalChildren = dom.childNodes,
			children = [],
			keyed = {},
			keyedLen = 0,
			min = 0,
			len = originalChildren.length,
			childrenLen = 0,
			vlen = vchildren && vchildren.length,
			j, c, vchild, child;

		if (len) {
			for (var i=0; i<len; i++) {
				var child$1 = originalChildren[i],
					props = child$1[ATTR_KEY],
					key = vlen ? ((c = child$1._component) ? c.__key : props ? props.key : null) : null;
				if (key!=null) {
					keyedLen++;
					keyed[key] = child$1;
				}
				else if (hydrating || absorb || props || child$1 instanceof Text) {
					children[childrenLen++] = child$1;
				}
			}
		}

		if (vlen) {
			for (var i$1=0; i$1<vlen; i$1++) {
				vchild = vchildren[i$1];
				child = null;

				// if (isFunctionalComponent(vchild)) {
				// 	vchild = buildFunctionalComponent(vchild);
				// }

				// attempt to find a node based on key matching
				var key$1 = vchild.key;
				if (key$1!=null) {
					if (keyedLen && key$1 in keyed) {
						child = keyed[key$1];
						keyed[key$1] = undefined;
						keyedLen--;
					}
				}
				// attempt to pluck a node of the same type from the existing children
				else if (!child && min<childrenLen) {
					for (j=min; j<childrenLen; j++) {
						c = children[j];
						if (c && isSameNodeType(c, vchild)) {
							child = c;
							children[j] = undefined;
							if (j===childrenLen-1) { childrenLen--; }
							if (j===min) { min++; }
							break;
						}
					}
				}

				// morph the matched/found/created DOM child to match vchild (deep)
				child = idiff(child, vchild, context, mountAll);

				if (child && child!==dom) {
					if (i$1>=len) {
						dom.appendChild(child);
					}
					else if (child!==originalChildren[i$1]) {
						if (child===originalChildren[i$1+1]) {
							removeNode(originalChildren[i$1]);
						}
						dom.insertBefore(child, originalChildren[i$1] || null);
					}
				}
			}
		}


		if (keyedLen) {
			for (var i$2 in keyed) { if (keyed[i$2]) { recollectNodeTree(keyed[i$2]); } }
		}

		// remove orphaned children
		while (min<=childrenLen) {
			child = children[childrenLen--];
			if (child) { recollectNodeTree(child); }
		}
	}



	/** Recursively recycle (or just unmount) a node an its descendants.
	 *	@param {Node} node						DOM node to start unmount/removal from
	 *	@param {Boolean} [unmountOnly=false]	If `true`, only triggers unmount lifecycle, skips removal
	 */
	function recollectNodeTree(node, unmountOnly) {
		var component = node._component;
		if (component) {
			// if node is owned by a Component, unmount that component (ends up recursing back here)
			unmountComponent(component, !unmountOnly);
		}
		else {
			// If the node's VNode had a ref function, invoke it with null here.
			// (this is part of the React spec, and smart for unsetting references)
			if (node[ATTR_KEY] && node[ATTR_KEY].ref) { node[ATTR_KEY].ref(null); }

			if (!unmountOnly) {
				collectNode(node);
			}

			// Recollect/unmount all children.
			// - we use .lastChild here because it causes less reflow than .firstChild
			// - it's also cheaper than accessing the .childNodes Live NodeList
			var c;
			while ((c=node.lastChild)) { recollectNodeTree(c, unmountOnly); }
		}
	}



	/** Apply differences in attributes from a VNode to the given DOM Element.
	 *	@param {Element} dom		Element with attributes to diff `attrs` against
	 *	@param {Object} attrs		The desired end-state key-value attribute pairs
	 *	@param {Object} old			Current/previous attributes (from previous VNode or element's prop cache)
	 */
	function diffAttributes(dom, attrs, old) {
		// remove attributes no longer present on the vnode by setting them to undefined
		var name;
		for (name in old) {
			if (!(attrs && name in attrs) && old[name]!=null) {
				setAccessor(dom, name, old[name], old[name] = undefined, isSvgMode);
			}
		}

		// add new & update changed attributes
		if (attrs) {
			for (name in attrs) {
				if (name!=='children' && name!=='innerHTML' && (!(name in old) || attrs[name]!==(name==='value' || name==='checked' ? dom[name] : old[name]))) {
					setAccessor(dom, name, old[name], old[name] = attrs[name], isSvgMode);
				}
			}
		}
	}

	/** Retains a pool of Components for re-use, keyed on component name.
	 *	Note: since component names are not unique or even necessarily available, these are primarily a form of sharding.
	 *	@private
	 */
	var components = {};


	function collectComponent(component) {
		var name = component.constructor.name,
			list = components[name];
		if (list) { list.push(component); }
		else { components[name] = [component]; }
	}


	function createComponent(Ctor, props, context) {
		var inst = new Ctor(props, context),
			list = components[Ctor.name];
		Component.call(inst, props, context);
		if (list) {
			for (var i=list.length; i--; ) {
				if (list[i].constructor===Ctor) {
					inst.nextBase = list[i].nextBase;
					list.splice(i, 1);
					break;
				}
			}
		}
		return inst;
	}

	/** Set a component's `props` (generally derived from JSX attributes).
	 *	@param {Object} props
	 *	@param {Object} [opts]
	 *	@param {boolean} [opts.renderSync=false]	If `true` and {@link options.syncComponentUpdates} is `true`, triggers synchronous rendering.
	 *	@param {boolean} [opts.render=true]			If `false`, no render will be triggered.
	 */
	function setComponentProps(component, props, opts, context, mountAll) {
		if (component._disable) { return; }
		component._disable = true;

		if ((component.__ref = props.ref)) { delete props.ref; }
		if ((component.__key = props.key)) { delete props.key; }

		if (!component.base || mountAll) {
			if (component.componentWillMount) { component.componentWillMount(); }
		}
		else if (component.componentWillReceiveProps) {
			component.componentWillReceiveProps(props, context);
		}

		if (context && context!==component.context) {
			if (!component.prevContext) { component.prevContext = component.context; }
			component.context = context;
		}

		if (!component.prevProps) { component.prevProps = component.props; }
		component.props = props;

		component._disable = false;

		if (opts!==NO_RENDER) {
			if (opts===SYNC_RENDER || options.syncComponentUpdates!==false || !component.base) {
				renderComponent(component, SYNC_RENDER, mountAll);
			}
			else {
				enqueueRender(component);
			}
		}

		if (component.__ref) { component.__ref(component); }
	}



	/** Render a Component, triggering necessary lifecycle events and taking High-Order Components into account.
	 *	@param {Component} component
	 *	@param {Object} [opts]
	 *	@param {boolean} [opts.build=false]		If `true`, component will build and store a DOM node if not already associated with one.
	 *	@private
	 */
	function renderComponent(component, opts, mountAll, isChild) {
		if (component._disable) { return; }

		var skip, rendered,
			props = component.props,
			state = component.state,
			context = component.context,
			previousProps = component.prevProps || props,
			previousState = component.prevState || state,
			previousContext = component.prevContext || context,
			isUpdate = component.base,
			nextBase = component.nextBase,
			initialBase = isUpdate || nextBase,
			initialChildComponent = component._component,
			inst, cbase;

		// if updating
		if (isUpdate) {
			component.props = previousProps;
			component.state = previousState;
			component.context = previousContext;
			if (opts!==FORCE_RENDER
				&& component.shouldComponentUpdate
				&& component.shouldComponentUpdate(props, state, context) === false) {
				skip = true;
			}
			else if (component.componentWillUpdate) {
				component.componentWillUpdate(props, state, context);
			}
			component.props = props;
			component.state = state;
			component.context = context;
		}

		component.prevProps = component.prevState = component.prevContext = component.nextBase = null;
		component._dirty = false;

		if (!skip) {
			if (component.render) { rendered = component.render(props, state, context); }

			// context to pass to the child, can be updated via (grand-)parent component
			if (component.getChildContext) {
				context = extend(clone(context), component.getChildContext());
			}

			while (isFunctionalComponent(rendered)) {
				rendered = buildFunctionalComponent(rendered, context);
			}

			var childComponent = rendered && rendered.nodeName,
				toUnmount, base;

			if (isFunction(childComponent)) {
				// set up high order component link

				var childProps = getNodeProps(rendered);
				inst = initialChildComponent;

				if (inst && inst.constructor===childComponent && childProps.key==inst.__key) {
					setComponentProps(inst, childProps, SYNC_RENDER, context);
				}
				else {
					toUnmount = inst;

					inst = createComponent(childComponent, childProps, context);
					inst.nextBase = inst.nextBase || nextBase;
					inst._parentComponent = component;
					component._component = inst;
					setComponentProps(inst, childProps, NO_RENDER, context);
					renderComponent(inst, SYNC_RENDER, mountAll, true);
				}

				base = inst.base;
			}
			else {
				cbase = initialBase;

				// destroy high order component link
				toUnmount = initialChildComponent;
				if (toUnmount) {
					cbase = component._component = null;
				}

				if (initialBase || opts===SYNC_RENDER) {
					if (cbase) { cbase._component = null; }
					base = diff(cbase, rendered, context, mountAll || !isUpdate, initialBase && initialBase.parentNode, true);
				}
			}

			if (initialBase && base!==initialBase && inst!==initialChildComponent) {
				var baseParent = initialBase.parentNode;
				if (baseParent && base!==baseParent) {
					baseParent.replaceChild(base, initialBase);

					if (!toUnmount) {
						initialBase._component = null;
						recollectNodeTree(initialBase);
					}
				}
			}

			if (toUnmount) {
				unmountComponent(toUnmount, base!==initialBase);
			}

			component.base = base;
			if (base && !isChild) {
				var componentRef = component,
					t = component;
				while ((t=t._parentComponent)) {
					(componentRef = t).base = base;
				}
				base._component = componentRef;
				base._componentConstructor = componentRef.constructor;
			}
		}

		if (!isUpdate || mountAll) {
			mounts.unshift(component);
		}
		else if (!skip) {
			if (component.componentDidUpdate) {
				component.componentDidUpdate(previousProps, previousState, previousContext);
			}
		}

		var cb = component._renderCallbacks, fn;
		if (cb) { while ( (fn = cb.pop()) ) { fn.call(component); } }

		if (!diffLevel && !isChild) { flushMounts(); }
	}



	/** Apply the Component referenced by a VNode to the DOM.
	 *	@param {Element} dom	The DOM node to mutate
	 *	@param {VNode} vnode	A Component-referencing VNode
	 *	@returns {Element} dom	The created/mutated element
	 *	@private
	 */
	function buildComponentFromVNode(dom, vnode, context, mountAll) {
		var c = dom && dom._component,
			originalComponent = c,
			oldDom = dom,
			isDirectOwner = c && dom._componentConstructor===vnode.nodeName,
			isOwner = isDirectOwner,
			props = getNodeProps(vnode);
		while (c && !isOwner && (c=c._parentComponent)) {
			isOwner = c.constructor===vnode.nodeName;
		}

		if (c && isOwner && (!mountAll || c._component)) {
			setComponentProps(c, props, ASYNC_RENDER, context, mountAll);
			dom = c.base;
		}
		else {
			if (originalComponent && !isDirectOwner) {
				unmountComponent(originalComponent, true);
				dom = oldDom = null;
			}

			c = createComponent(vnode.nodeName, props, context);
			if (dom && !c.nextBase) {
				c.nextBase = dom;
				// passing dom/oldDom as nextBase will recycle it if unused, so bypass recycling on L241:
				oldDom = null;
			}
			setComponentProps(c, props, SYNC_RENDER, context, mountAll);
			dom = c.base;

			if (oldDom && dom!==oldDom) {
				oldDom._component = null;
				recollectNodeTree(oldDom);
			}
		}

		return dom;
	}



	/** Remove a component from the DOM and recycle it.
	 *	@param {Element} dom			A DOM node from which to unmount the given Component
	 *	@param {Component} component	The Component instance to unmount
	 *	@private
	 */
	function unmountComponent(component, remove) {

		// console.log(`${remove?'Removing':'Unmounting'} component: ${component.constructor.name}`);
		var base = component.base;

		component._disable = true;

		if (component.componentWillUnmount) { component.componentWillUnmount(); }

		component.base = null;

		// recursively tear down & recollect high-order component children:
		var inner = component._component;
		if (inner) {
			unmountComponent(inner, remove);
		}
		else if (base) {
			if (base[ATTR_KEY] && base[ATTR_KEY].ref) { base[ATTR_KEY].ref(null); }

			component.nextBase = base;

			if (remove) {
				removeNode(base);
				collectComponent(component);
			}
			var c;
			while ((c=base.lastChild)) { recollectNodeTree(c, !remove); }
			// removeOrphanedChildren(base.childNodes, true);
		}

		if (component.__ref) { component.__ref(null); }
		if (component.componentDidUnmount) { component.componentDidUnmount(); }
	}

	/** Base Component class, for the ES6 Class method of creating Components
	 *	@public
	 *
	 *	@example
	 *	class MyFoo extends Component {
	 *		render(props, state) {
	 *			return <div />;
	 *		}
	 *	}
	 */
	function Component(props, context) {
		/** @private */
		this._dirty = true;
		// /** @public */
		// this._disableRendering = false;
		// /** @public */
		// this.prevState = this.prevProps = this.prevContext = this.base = this.nextBase = this._parentComponent = this._component = this.__ref = this.__key = this._linkedStates = this._renderCallbacks = null;
		/** @public */
		this.context = context;
		/** @type {object} */
		this.props = props;
		/** @type {object} */
		if (!this.state) { this.state = {}; }
	}


	extend(Component.prototype, {

		/** Returns a `boolean` value indicating if the component should re-render when receiving the given `props` and `state`.
		 *	@param {object} nextProps
		 *	@param {object} nextState
		 *	@param {object} nextContext
		 *	@returns {Boolean} should the component re-render
		 *	@name shouldComponentUpdate
		 *	@function
		 */
		// shouldComponentUpdate() {
		// 	return true;
		// },


		/** Returns a function that sets a state property when called.
		 *	Calling linkState() repeatedly with the same arguments returns a cached link function.
		 *
		 *	Provides some built-in special cases:
		 *		- Checkboxes and radio buttons link their boolean `checked` value
		 *		- Inputs automatically link their `value` property
		 *		- Event paths fall back to any associated Component if not found on an element
		 *		- If linked value is a function, will invoke it and use the result
		 *
		 *	@param {string} key		The path to set - can be a dot-notated deep key
		 *	@param {string} [eventPath]	If set, attempts to find the new state value at a given dot-notated path within the object passed to the linkedState setter.
		 *	@returns {function} linkStateSetter(e)
		 *
		 *	@example Update a "text" state value when an input changes:
		 *		<input onChange={ this.linkState('text') } />
		 *
		 *	@example Set a deep state value on click
		 *		<button onClick={ this.linkState('touch.coords', 'touches.0') }>Tap</button
		 */
		linkState: function linkState(key, eventPath) {
			var c = this._linkedStates || (this._linkedStates = {});
			return c[key+eventPath] || (c[key+eventPath] = createLinkedState(this, key, eventPath));
		},


		/** Update component state by copying properties from `state` to `this.state`.
		 *	@param {object} state		A hash of state properties to update with new values
		 */
		setState: function setState(state, callback) {
			var s = this.state;
			if (!this.prevState) { this.prevState = clone(s); }
			extend(s, isFunction(state) ? state(s, this.props) : state);
			if (callback) { (this._renderCallbacks = (this._renderCallbacks || [])).push(callback); }
			enqueueRender(this);
		},


		/** Immediately perform a synchronous re-render of the component.
		 *	@private
		 */
		forceUpdate: function forceUpdate() {
			renderComponent(this, FORCE_RENDER);
		},


		/** Accepts `props` and `state`, and returns a new Virtual DOM tree to build.
		 *	Virtual DOM is generally constructed via [JSX](http://jasonformat.com/wtf-is-jsx).
		 *	@param {object} props		Props (eg: JSX attributes) received from parent element/component
		 *	@param {object} state		The component's current state
		 *	@param {object} context		Context object (if a parent component has provided context)
		 *	@returns VNode
		 */
		render: function render() {}

	});

	/** Render JSX into a `parent` Element.
	 *	@param {VNode} vnode		A (JSX) VNode to render
	 *	@param {Element} parent		DOM element to render into
	 *	@param {Element} [merge]	Attempt to re-use an existing DOM tree rooted at `merge`
	 *	@public
	 *
	 *	@example
	 *	// render a div into <body>:
	 *	render(<div id="hello">hello!</div>, document.body);
	 *
	 *	@example
	 *	// render a "Thing" component into #foo:
	 *	const Thing = ({ name }) => <span>{ name }</span>;
	 *	render(<Thing name="one" />, document.querySelector('#foo'));
	 */
	function render(vnode, parent, merge) {
		return diff(merge, vnode, {}, false, parent);
	}

	var EMPTY$1 = {};

	function assign(obj, props) {
		// eslint-disable-next-line guard-for-in
		for (var i in props) {
			obj[i] = props[i];
		}
		return obj;
	}

	function exec(url, route, opts) {
		var reg = /(?:\?([^#]*))?(#.*)?$/,
			c = url.match(reg),
			matches = {},
			ret;
		if (c && c[1]) {
			var p = c[1].split('&');
			for (var i=0; i<p.length; i++) {
				var r = p[i].split('=');
				matches[decodeURIComponent(r[0])] = decodeURIComponent(r.slice(1).join('='));
			}
		}
		url = segmentize(url.replace(reg, ''));
		route = segmentize(route || '');
		var max = Math.max(url.length, route.length);
		for (var i$1=0; i$1<max; i$1++) {
			if (route[i$1] && route[i$1].charAt(0)===':') {
				var param = route[i$1].replace(/(^\:|[+*?]+$)/g, ''),
					flags = (route[i$1].match(/[+*?]+$/) || EMPTY$1)[0] || '',
					plus = ~flags.indexOf('+'),
					star = ~flags.indexOf('*'),
					val = url[i$1] || '';
				if (!val && !star && (flags.indexOf('?')<0 || plus)) {
					ret = false;
					break;
				}
				matches[param] = decodeURIComponent(val);
				if (plus || star) {
					matches[param] = url.slice(i$1).map(decodeURIComponent).join('/');
					break;
				}
			}
			else if (route[i$1]!==url[i$1]) {
				ret = false;
				break;
			}
		}
		if (opts.default!==true && ret===false) { return false; }
		return matches;
	}

	function pathRankSort(a, b) {
		return (
			(a.rank < b.rank) ? 1 :
			(a.rank > b.rank) ? -1 :
			(a.index - b.index)
		);
	}

	// filter out VNodes without attributes (which are unrankeable), and add `index`/`rank` properties to be used in sorting.
	function prepareVNodeForRanking(vnode, index) {
		vnode.index = index;
		vnode.rank = rankChild(vnode);
		return vnode.attributes;
	}

	function segmentize(url) {
		return url.replace(/(^\/+|\/+$)/g, '').split('/');
	}

	function rankSegment(segment) {
		return segment.charAt(0)==':' ? (1 + '*+?'.indexOf(segment.charAt(segment.length-1))) || 4 : 5;
	}

	function rank(path) {
		return segmentize(path).map(rankSegment).join('');
	}

	function rankChild(vnode) {
		return vnode.attributes.default ? 0 : rank(vnode.attributes.path);
	}

	var customHistory = null;

	var ROUTERS = [];

	var subscribers = [];

	var EMPTY$2 = {};

	function isPreactElement(node) {
		return node.__preactattr_!=null || typeof Symbol!=='undefined' && node[Symbol.for('preactattr')]!=null;
	}

	function setUrl(url, type) {
		if ( type === void 0 ) { type='push'; }

		if (customHistory && customHistory[type]) {
			customHistory[type](url);
		}
		else if (typeof history!=='undefined' && history[type+'State']) {
			history[type+'State'](null, null, url);
		}
	}


	function getCurrentUrl() {
		var url;
		if (customHistory && customHistory.location) {
			url = customHistory.location;
		}
		else if (customHistory && customHistory.getCurrentLocation) {
			url = customHistory.getCurrentLocation();
		}
		else {
			url = typeof location!=='undefined' ? location : EMPTY$2;
		}
		return ("" + (url.pathname || '') + (url.search || ''));
	}



	function route(url, replace) {
		if ( replace === void 0 ) { replace=false; }

		if (typeof url!=='string' && url.url) {
			replace = url.replace;
			url = url.url;
		}

		// only push URL into history if we can handle it
		if (canRoute(url)) {
			setUrl(url, replace ? 'replace' : 'push');
		}

		return routeTo(url);
	}


	/** Check if the given URL can be handled by any router instances. */
	function canRoute(url) {
		for (var i=ROUTERS.length; i--; ) {
			if (ROUTERS[i].canRoute(url)) { return true; }
		}
		return false;
	}


	/** Tell all router instances to handle the given URL.  */
	function routeTo(url) {
		var didRoute = false;
		for (var i=0; i<ROUTERS.length; i++) {
			if (ROUTERS[i].routeTo(url)===true) {
				didRoute = true;
			}
		}
		for (var i$1=subscribers.length; i$1--; ) {
			subscribers[i$1](url);
		}
		return didRoute;
	}


	function routeFromLink(node) {
		// only valid elements
		if (!node || !node.getAttribute) { return; }

		var href = node.getAttribute('href'),
			target = node.getAttribute('target');

		// ignore links with targets and non-path URLs
		if (!href || !href.match(/^\//g) || (target && !target.match(/^_?self$/i))) { return; }

		// attempt to route, if no match simply cede control to browser
		return route(href);
	}


	function handleLinkClick(e) {
		if (e.button==0) {
			routeFromLink(e.currentTarget || e.target || this);
			return prevent(e);
		}
	}


	function prevent(e) {
		if (e) {
			if (e.stopImmediatePropagation) { e.stopImmediatePropagation(); }
			if (e.stopPropagation) { e.stopPropagation(); }
			e.preventDefault();
		}
		return false;
	}


	function delegateLinkHandler(e) {
		// ignore events the browser takes care of already:
		if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.button!==0) { return; }

		var t = e.target;
		do {
			if (String(t.nodeName).toUpperCase()==='A' && t.getAttribute('href') && isPreactElement(t)) {
				if (t.hasAttribute('native')) { return; }
				// if link is handled by the router, prevent browser defaults
				if (routeFromLink(t)) {
					return prevent(e);
				}
			}
		} while ((t=t.parentNode));
	}


	var eventListenersInitialized = false;

	function initEventListeners() {
		if (eventListenersInitialized) { return; }

		if (typeof addEventListener==='function') {
			if (!customHistory) {
				addEventListener('popstate', function () {
					routeTo(getCurrentUrl());
				});
			}
			addEventListener('click', delegateLinkHandler);
		}
		eventListenersInitialized = true;
	}


	var Router = (function (Component$$1) {
		function Router(props) {
			Component$$1.call(this, props);
			if (props.history) {
				customHistory = props.history;
			}

			this.state = {
				url: props.url || getCurrentUrl()
			};

			initEventListeners();
		}

		if ( Component$$1 ) { Router.__proto__ = Component$$1; }
		Router.prototype = Object.create( Component$$1 && Component$$1.prototype );
		Router.prototype.constructor = Router;

		Router.prototype.shouldComponentUpdate = function shouldComponentUpdate (props) {
			if (props.static!==true) { return true; }
			return props.url!==this.props.url || props.onChange!==this.props.onChange;
		};

		/** Check if the given URL can be matched against any children */
		Router.prototype.canRoute = function canRoute (url) {
			return this.getMatchingChildren(this.props.children, url, false).length > 0;
		};

		/** Re-render children with a new URL to match against. */
		Router.prototype.routeTo = function routeTo (url) {
			this._didRoute = false;
			this.setState({ url: url });

			// if we're in the middle of an update, don't synchronously re-route.
			if (this.updating) { return this.canRoute(url); }

			this.forceUpdate();
			return this._didRoute;
		};

		Router.prototype.componentWillMount = function componentWillMount () {
			ROUTERS.push(this);
			this.updating = true;
		};

		Router.prototype.componentDidMount = function componentDidMount () {
			var this$1 = this;

			if (customHistory) {
				this.unlisten = customHistory.listen(function (location) {
					this$1.routeTo(("" + (location.pathname || '') + (location.search || '')));
				});
			}
			this.updating = false;
		};

		Router.prototype.componentWillUnmount = function componentWillUnmount () {
			if (typeof this.unlisten==='function') { this.unlisten(); }
			ROUTERS.splice(ROUTERS.indexOf(this), 1);
		};

		Router.prototype.componentWillUpdate = function componentWillUpdate () {
			this.updating = true;
		};

		Router.prototype.componentDidUpdate = function componentDidUpdate () {
			this.updating = false;
		};

		Router.prototype.getMatchingChildren = function getMatchingChildren (children, url, invoke) {
			return children
				.filter(prepareVNodeForRanking)
				.sort(pathRankSort)
				.map( function (vnode) {
					var matches = exec(url, vnode.attributes.path, vnode.attributes);
					if (matches) {
						if (invoke !== false) {
							var newProps = { url: url, matches: matches };
							assign(newProps, matches);
							delete newProps.ref;
							delete newProps.key;
							return cloneElement(vnode, newProps);
						}
						return vnode;
					}
				}).filter(Boolean);
		};

		Router.prototype.render = function render$$1 (ref, ref$1) {
			var children = ref.children;
			var onChange = ref.onChange;
			var url = ref$1.url;

			var active = this.getMatchingChildren(children, url, true);

			var current = active[0] || null;
			this._didRoute = !!current;

			var previous = this.previousUrl;
			if (url!==previous) {
				this.previousUrl = url;
				if (typeof onChange==='function') {
					onChange({
						router: this,
						url: url,
						previous: previous,
						active: active,
						current: current
					});
				}
			}

			return current;
		};

		return Router;
	}(Component));

	var Link = function (props) { return (
		h('a', assign({ onClick: handleLinkClick }, props))
	); };

	var Route = function (props) { return h(props.component, props); };

	Router.subscribers = subscribers;
	Router.getCurrentUrl = getCurrentUrl;
	Router.route = route;
	Router.Router = Router;
	Router.Route = Route;
	Router.Link = Link;

	function unwrapExports (x) {
		return x && x.__esModule ? x['default'] : x;
	}

	function createCommonjsModule(fn, module) {
		return module = { exports: {} }, fn(module, module.exports), module.exports;
	}

	/** MobX - (c) Michel Weststrate 2015, 2016 - MIT Licensed */
	/*! *****************************************************************************
	Copyright (c) Microsoft Corporation. All rights reserved.
	Licensed under the Apache License, Version 2.0 (the "License"); you may not use
	this file except in compliance with the License. You may obtain a copy of the
	License at http://www.apache.org/licenses/LICENSE-2.0

	THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
	KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
	WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
	MERCHANTABLITY OR NON-INFRINGEMENT.

	See the Apache Version 2.0 License for specific language governing permissions
	and limitations under the License.
	***************************************************************************** */
	/* global Reflect, Promise */

	var extendStatics = Object.setPrototypeOf ||
	    ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
	    function (d, b) { for (var p in b) { if (b.hasOwnProperty(p)) { d[p] = b[p]; } } };

	function __extends(d, b) {
	    extendStatics(d, b);
	    function __() { this.constructor = d; }
	    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
	}

	/**
	 * Anything that can be used to _store_ state is an Atom in mobx. Atoms have two important jobs
	 *
	 * 1) detect when they are being _used_ and report this (using reportObserved). This allows mobx to make the connection between running functions and the data they used
	 * 2) they should notify mobx whenever they have _changed_. This way mobx can re-run any functions (derivations) that are using this atom.
	 */
	var BaseAtom = /** @class */ (function () {
	    /**
	     * Create a new atom. For debugging purposes it is recommended to give it a name.
	     * The onBecomeObserved and onBecomeUnobserved callbacks can be used for resource management.
	     */
	    function BaseAtom(name) {
	        if (name === void 0) { name = "Atom@" + getNextId(); }
	        this.name = name;
	        this.isPendingUnobservation = true; // for effective unobserving. BaseAtom has true, for extra optimization, so its onBecomeUnobserved never gets called, because it's not needed
	        this.observers = [];
	        this.observersIndexes = {};
	        this.diffValue = 0;
	        this.lastAccessedBy = 0;
	        this.lowestObserverState = IDerivationState.NOT_TRACKING;
	    }
	    BaseAtom.prototype.onBecomeUnobserved = function () {
	        // noop
	    };
	    /**
	     * Invoke this method to notify mobx that your atom has been used somehow.
	     */
	    BaseAtom.prototype.reportObserved = function () {
	        reportObserved(this);
	    };
	    /**
	     * Invoke this method _after_ this method has changed to signal mobx that all its observers should invalidate.
	     */
	    BaseAtom.prototype.reportChanged = function () {
	        startBatch();
	        propagateChanged(this);
	        endBatch();
	    };
	    BaseAtom.prototype.toString = function () {
	        return this.name;
	    };
	    return BaseAtom;
	}());
	var Atom = /** @class */ (function (_super) {
	    __extends(Atom, _super);
	    /**
	     * Create a new atom. For debugging purposes it is recommended to give it a name.
	     * The onBecomeObserved and onBecomeUnobserved callbacks can be used for resource management.
	     */
	    function Atom(name, onBecomeObservedHandler, onBecomeUnobservedHandler) {
	        if (name === void 0) { name = "Atom@" + getNextId(); }
	        if (onBecomeObservedHandler === void 0) { onBecomeObservedHandler = noop; }
	        if (onBecomeUnobservedHandler === void 0) { onBecomeUnobservedHandler = noop; }
	        var _this = _super.call(this, name) || this;
	        _this.name = name;
	        _this.onBecomeObservedHandler = onBecomeObservedHandler;
	        _this.onBecomeUnobservedHandler = onBecomeUnobservedHandler;
	        _this.isPendingUnobservation = false; // for effective unobserving.
	        _this.isBeingTracked = false;
	        return _this;
	    }
	    Atom.prototype.reportObserved = function () {
	        startBatch();
	        _super.prototype.reportObserved.call(this);
	        if (!this.isBeingTracked) {
	            this.isBeingTracked = true;
	            this.onBecomeObservedHandler();
	        }
	        endBatch();
	        return !!globalState.trackingDerivation;
	        // return doesn't really give useful info, because it can be as well calling computed which calls atom (no reactions)
	        // also it could not trigger when calculating reaction dependent on Atom because Atom's value was cached by computed called by given reaction.
	    };
	    Atom.prototype.onBecomeUnobserved = function () {
	        this.isBeingTracked = false;
	        this.onBecomeUnobservedHandler();
	    };
	    return Atom;
	}(BaseAtom));
	var isAtom = createInstanceofPredicate("Atom", BaseAtom);

	function hasInterceptors(interceptable) {
	    return interceptable.interceptors && interceptable.interceptors.length > 0;
	}
	function registerInterceptor(interceptable, handler) {
	    var interceptors = interceptable.interceptors || (interceptable.interceptors = []);
	    interceptors.push(handler);
	    return once(function () {
	        var idx = interceptors.indexOf(handler);
	        if (idx !== -1)
	            { interceptors.splice(idx, 1); }
	    });
	}
	function interceptChange(interceptable, change) {
	    var prevU = untrackedStart();
	    try {
	        var interceptors = interceptable.interceptors;
	        if (interceptors)
	            { for (var i = 0, l = interceptors.length; i < l; i++) {
	                change = interceptors[i](change);
	                invariant(!change || change.type, "Intercept handlers should return nothing or a change object");
	                if (!change)
	                    { break; }
	            } }
	        return change;
	    }
	    finally {
	        untrackedEnd(prevU);
	    }
	}

	function hasListeners(listenable) {
	    return listenable.changeListeners && listenable.changeListeners.length > 0;
	}
	function registerListener(listenable, handler) {
	    var listeners = listenable.changeListeners || (listenable.changeListeners = []);
	    listeners.push(handler);
	    return once(function () {
	        var idx = listeners.indexOf(handler);
	        if (idx !== -1)
	            { listeners.splice(idx, 1); }
	    });
	}
	function notifyListeners(listenable, change) {
	    var prevU = untrackedStart();
	    var listeners = listenable.changeListeners;
	    if (!listeners)
	        { return; }
	    listeners = listeners.slice();
	    for (var i = 0, l = listeners.length; i < l; i++) {
	        listeners[i](change);
	    }
	    untrackedEnd(prevU);
	}

	function isSpyEnabled() {
	    return !!globalState.spyListeners.length;
	}
	function spyReport(event) {
	    if (!globalState.spyListeners.length)
	        { return; }
	    var listeners = globalState.spyListeners;
	    for (var i = 0, l = listeners.length; i < l; i++)
	        { listeners[i](event); }
	}
	function spyReportStart(event) {
	    var change = objectAssign({}, event, { spyReportStart: true });
	    spyReport(change);
	}
	var END_EVENT = { spyReportEnd: true };
	function spyReportEnd(change) {
	    if (change)
	        { spyReport(objectAssign({}, change, END_EVENT)); }
	    else
	        { spyReport(END_EVENT); }
	}
	function spy(listener) {
	    globalState.spyListeners.push(listener);
	    return once(function () {
	        var idx = globalState.spyListeners.indexOf(listener);
	        if (idx !== -1)
	            { globalState.spyListeners.splice(idx, 1); }
	    });
	}

	function iteratorSymbol() {
	    return (typeof Symbol === "function" && Symbol.iterator) || "@@iterator";
	}
	var IS_ITERATING_MARKER = "__$$iterating";
	function arrayAsIterator(array) {
	    // returning an array for entries(), values() etc for maps was a mis-interpretation of the specs..,
	    // yet it is quite convenient to be able to use the response both as array directly and as iterator
	    // it is suboptimal, but alas...
	    invariant(array[IS_ITERATING_MARKER] !== true, "Illegal state: cannot recycle array as iterator");
	    addHiddenFinalProp(array, IS_ITERATING_MARKER, true);
	    var idx = -1;
	    addHiddenFinalProp(array, "next", function next() {
	        idx++;
	        return {
	            done: idx >= this.length,
	            value: idx < this.length ? this[idx] : undefined
	        };
	    });
	    return array;
	}
	function declareIterator(prototType, iteratorFactory) {
	    addHiddenFinalProp(prototType, iteratorSymbol(), iteratorFactory);
	}

	var MAX_SPLICE_SIZE = 10000; // See e.g. https://github.com/mobxjs/mobx/issues/859
	// Detects bug in safari 9.1.1 (or iOS 9 safari mobile). See #364
	var safariPrototypeSetterInheritanceBug = (function () {
	    var v = false;
	    var p = {};
	    Object.defineProperty(p, "0", {
	        set: function () {
	            v = true;
	        }
	    });
	    Object.create(p)["0"] = 1;
	    return v === false;
	})();
	/**
	 * This array buffer contains two lists of properties, so that all arrays
	 * can recycle their property definitions, which significantly improves performance of creating
	 * properties on the fly.
	 */
	var OBSERVABLE_ARRAY_BUFFER_SIZE = 0;
	// Typescript workaround to make sure ObservableArray extends Array
	var StubArray = /** @class */ (function () {
	    function StubArray() {
	    }
	    return StubArray;
	}());
	function inherit(ctor, proto) {
	    if (typeof Object["setPrototypeOf"] !== "undefined") {
	        Object["setPrototypeOf"](ctor.prototype, proto);
	    }
	    else if (typeof ctor.prototype.__proto__ !== "undefined") {
	        ctor.prototype.__proto__ = proto;
	    }
	    else {
	        ctor["prototype"] = proto;
	    }
	}
	inherit(StubArray, Array.prototype);
	// Weex freeze Array.prototype
	// Make them writeable and configurable in prototype chain
	// https://github.com/alibaba/weex/pull/1529
	if (Object.isFrozen(Array)) {
	    
	    [
	        "constructor",
	        "push",
	        "shift",
	        "concat",
	        "pop",
	        "unshift",
	        "replace",
	        "find",
	        "findIndex",
	        "splice",
	        "reverse",
	        "sort"
	    ].forEach(function (key) {
	        Object.defineProperty(StubArray.prototype, key, {
	            configurable: true,
	            writable: true,
	            value: Array.prototype[key]
	        });
	    });
	}
	var ObservableArrayAdministration = /** @class */ (function () {
	    function ObservableArrayAdministration(name, enhancer, array, owned) {
	        this.array = array;
	        this.owned = owned;
	        this.values = [];
	        this.lastKnownLength = 0;
	        this.interceptors = null;
	        this.changeListeners = null;
	        this.atom = new BaseAtom(name || "ObservableArray@" + getNextId());
	        this.enhancer = function (newV, oldV) { return enhancer(newV, oldV, name + "[..]"); };
	    }
	    ObservableArrayAdministration.prototype.dehanceValue = function (value) {
	        if (this.dehancer !== undefined)
	            { return this.dehancer(value); }
	        return value;
	    };
	    ObservableArrayAdministration.prototype.dehanceValues = function (values) {
	        if (this.dehancer !== undefined)
	            { return values.map(this.dehancer); }
	        return values;
	    };
	    ObservableArrayAdministration.prototype.intercept = function (handler) {
	        return registerInterceptor(this, handler);
	    };
	    ObservableArrayAdministration.prototype.observe = function (listener, fireImmediately) {
	        if (fireImmediately === void 0) { fireImmediately = false; }
	        if (fireImmediately) {
	            listener({
	                object: this.array,
	                type: "splice",
	                index: 0,
	                added: this.values.slice(),
	                addedCount: this.values.length,
	                removed: [],
	                removedCount: 0
	            });
	        }
	        return registerListener(this, listener);
	    };
	    ObservableArrayAdministration.prototype.getArrayLength = function () {
	        this.atom.reportObserved();
	        return this.values.length;
	    };
	    ObservableArrayAdministration.prototype.setArrayLength = function (newLength) {
	        if (typeof newLength !== "number" || newLength < 0)
	            { throw new Error("[mobx.array] Out of range: " + newLength); }
	        var currentLength = this.values.length;
	        if (newLength === currentLength)
	            { return; }
	        else if (newLength > currentLength) {
	            var newItems = new Array(newLength - currentLength);
	            for (var i = 0; i < newLength - currentLength; i++)
	                { newItems[i] = undefined; } // No Array.fill everywhere...
	            this.spliceWithArray(currentLength, 0, newItems);
	        }
	        else
	            { this.spliceWithArray(newLength, currentLength - newLength); }
	    };
	    // adds / removes the necessary numeric properties to this object
	    ObservableArrayAdministration.prototype.updateArrayLength = function (oldLength, delta) {
	        if (oldLength !== this.lastKnownLength)
	            { throw new Error("[mobx] Modification exception: the internal structure of an observable array was changed. Did you use peek() to change it?"); }
	        this.lastKnownLength += delta;
	        if (delta > 0 && oldLength + delta + 1 > OBSERVABLE_ARRAY_BUFFER_SIZE)
	            { reserveArrayBuffer(oldLength + delta + 1); }
	    };
	    ObservableArrayAdministration.prototype.spliceWithArray = function (index, deleteCount, newItems) {
	        var _this = this;
	        checkIfStateModificationsAreAllowed(this.atom);
	        var length = this.values.length;
	        if (index === undefined)
	            { index = 0; }
	        else if (index > length)
	            { index = length; }
	        else if (index < 0)
	            { index = Math.max(0, length + index); }
	        if (arguments.length === 1)
	            { deleteCount = length - index; }
	        else if (deleteCount === undefined || deleteCount === null)
	            { deleteCount = 0; }
	        else
	            { deleteCount = Math.max(0, Math.min(deleteCount, length - index)); }
	        if (newItems === undefined)
	            { newItems = []; }
	        if (hasInterceptors(this)) {
	            var change = interceptChange(this, {
	                object: this.array,
	                type: "splice",
	                index: index,
	                removedCount: deleteCount,
	                added: newItems
	            });
	            if (!change)
	                { return EMPTY_ARRAY; }
	            deleteCount = change.removedCount;
	            newItems = change.added;
	        }
	        newItems = newItems.map(function (v) { return _this.enhancer(v, undefined); });
	        var lengthDelta = newItems.length - deleteCount;
	        this.updateArrayLength(length, lengthDelta); // create or remove new entries
	        var res = this.spliceItemsIntoValues(index, deleteCount, newItems);
	        if (deleteCount !== 0 || newItems.length !== 0)
	            { this.notifyArraySplice(index, newItems, res); }
	        return this.dehanceValues(res);
	    };
	    ObservableArrayAdministration.prototype.spliceItemsIntoValues = function (index, deleteCount, newItems) {
	        if (newItems.length < MAX_SPLICE_SIZE) {
	            return (_a = this.values).splice.apply(_a, [index, deleteCount].concat(newItems));
	        }
	        else {
	            var res = this.values.slice(index, index + deleteCount);
	            this.values = this.values
	                .slice(0, index)
	                .concat(newItems, this.values.slice(index + deleteCount));
	            return res;
	        }
	        var _a;
	    };
	    ObservableArrayAdministration.prototype.notifyArrayChildUpdate = function (index, newValue, oldValue) {
	        var notifySpy = !this.owned && isSpyEnabled();
	        var notify = hasListeners(this);
	        var change = notify || notifySpy
	            ? {
	                object: this.array,
	                type: "update",
	                index: index,
	                newValue: newValue,
	                oldValue: oldValue
	            }
	            : null;
	        if (notifySpy)
	            { spyReportStart(change); }
	        this.atom.reportChanged();
	        if (notify)
	            { notifyListeners(this, change); }
	        if (notifySpy)
	            { spyReportEnd(); }
	    };
	    ObservableArrayAdministration.prototype.notifyArraySplice = function (index, added, removed) {
	        var notifySpy = !this.owned && isSpyEnabled();
	        var notify = hasListeners(this);
	        var change = notify || notifySpy
	            ? {
	                object: this.array,
	                type: "splice",
	                index: index,
	                removed: removed,
	                added: added,
	                removedCount: removed.length,
	                addedCount: added.length
	            }
	            : null;
	        if (notifySpy)
	            { spyReportStart(change); }
	        this.atom.reportChanged();
	        // conform: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/observe
	        if (notify)
	            { notifyListeners(this, change); }
	        if (notifySpy)
	            { spyReportEnd(); }
	    };
	    return ObservableArrayAdministration;
	}());
	var ObservableArray = /** @class */ (function (_super) {
	    __extends(ObservableArray, _super);
	    function ObservableArray(initialValues, enhancer, name, owned) {
	        if (name === void 0) { name = "ObservableArray@" + getNextId(); }
	        if (owned === void 0) { owned = false; }
	        var _this = _super.call(this) || this;
	        var adm = new ObservableArrayAdministration(name, enhancer, _this, owned);
	        addHiddenFinalProp(_this, "$mobx", adm);
	        if (initialValues && initialValues.length) {
	            _this.spliceWithArray(0, 0, initialValues);
	        }
	        if (safariPrototypeSetterInheritanceBug) {
	            // Seems that Safari won't use numeric prototype setter untill any * numeric property is
	            // defined on the instance. After that it works fine, even if this property is deleted.
	            Object.defineProperty(adm.array, "0", ENTRY_0);
	        }
	        return _this;
	    }
	    ObservableArray.prototype.intercept = function (handler) {
	        return this.$mobx.intercept(handler);
	    };
	    ObservableArray.prototype.observe = function (listener, fireImmediately) {
	        if (fireImmediately === void 0) { fireImmediately = false; }
	        return this.$mobx.observe(listener, fireImmediately);
	    };
	    ObservableArray.prototype.clear = function () {
	        return this.splice(0);
	    };
	    ObservableArray.prototype.concat = function () {
	        var arguments$1 = arguments;

	        var arrays = [];
	        for (var _i = 0; _i < arguments.length; _i++) {
	            arrays[_i] = arguments$1[_i];
	        }
	        this.$mobx.atom.reportObserved();
	        return Array.prototype.concat.apply(this.peek(), arrays.map(function (a) { return (isObservableArray(a) ? a.peek() : a); }));
	    };
	    ObservableArray.prototype.replace = function (newItems) {
	        return this.$mobx.spliceWithArray(0, this.$mobx.values.length, newItems);
	    };
	    /**
	     * Converts this array back to a (shallow) javascript structure.
	     * For a deep clone use mobx.toJS
	     */
	    ObservableArray.prototype.toJS = function () {
	        return this.slice();
	    };
	    ObservableArray.prototype.toJSON = function () {
	        // Used by JSON.stringify
	        return this.toJS();
	    };
	    ObservableArray.prototype.peek = function () {
	        this.$mobx.atom.reportObserved();
	        return this.$mobx.dehanceValues(this.$mobx.values);
	    };
	    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
	    ObservableArray.prototype.find = function (predicate, thisArg, fromIndex) {
	        if (fromIndex === void 0) { fromIndex = 0; }
	        var idx = this.findIndex.apply(this, arguments);
	        return idx === -1 ? undefined : this.get(idx);
	    };
	    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/findIndex
	    ObservableArray.prototype.findIndex = function (predicate, thisArg, fromIndex) {
	        var this$1 = this;

	        if (fromIndex === void 0) { fromIndex = 0; }
	        var items = this.peek(), l = items.length;
	        for (var i = fromIndex; i < l; i++)
	            { if (predicate.call(thisArg, items[i], i, this$1))
	                { return i; } }
	        return -1;
	    };
	    /*
	     * functions that do alter the internal structure of the array, (based on lib.es6.d.ts)
	     * since these functions alter the inner structure of the array, the have side effects.
	     * Because the have side effects, they should not be used in computed function,
	     * and for that reason the do not call dependencyState.notifyObserved
	     */
	    ObservableArray.prototype.splice = function (index, deleteCount) {
	        var arguments$1 = arguments;

	        var newItems = [];
	        for (var _i = 2; _i < arguments.length; _i++) {
	            newItems[_i - 2] = arguments$1[_i];
	        }
	        switch (arguments.length) {
	            case 0:
	                return [];
	            case 1:
	                return this.$mobx.spliceWithArray(index);
	            case 2:
	                return this.$mobx.spliceWithArray(index, deleteCount);
	        }
	        return this.$mobx.spliceWithArray(index, deleteCount, newItems);
	    };
	    ObservableArray.prototype.spliceWithArray = function (index, deleteCount, newItems) {
	        return this.$mobx.spliceWithArray(index, deleteCount, newItems);
	    };
	    ObservableArray.prototype.push = function () {
	        var arguments$1 = arguments;

	        var items = [];
	        for (var _i = 0; _i < arguments.length; _i++) {
	            items[_i] = arguments$1[_i];
	        }
	        var adm = this.$mobx;
	        adm.spliceWithArray(adm.values.length, 0, items);
	        return adm.values.length;
	    };
	    ObservableArray.prototype.pop = function () {
	        return this.splice(Math.max(this.$mobx.values.length - 1, 0), 1)[0];
	    };
	    ObservableArray.prototype.shift = function () {
	        return this.splice(0, 1)[0];
	    };
	    ObservableArray.prototype.unshift = function () {
	        var arguments$1 = arguments;

	        var items = [];
	        for (var _i = 0; _i < arguments.length; _i++) {
	            items[_i] = arguments$1[_i];
	        }
	        var adm = this.$mobx;
	        adm.spliceWithArray(0, 0, items);
	        return adm.values.length;
	    };
	    ObservableArray.prototype.reverse = function () {
	        // reverse by default mutates in place before returning the result
	        // which makes it both a 'derivation' and a 'mutation'.
	        // so we deviate from the default and just make it an dervitation
	        var clone = this.slice();
	        return clone.reverse.apply(clone, arguments);
	    };
	    ObservableArray.prototype.sort = function (compareFn) {
	        // sort by default mutates in place before returning the result
	        // which goes against all good practices. Let's not change the array in place!
	        var clone = this.slice();
	        return clone.sort.apply(clone, arguments);
	    };
	    ObservableArray.prototype.remove = function (value) {
	        var idx = this.$mobx.dehanceValues(this.$mobx.values).indexOf(value);
	        if (idx > -1) {
	            this.splice(idx, 1);
	            return true;
	        }
	        return false;
	    };
	    ObservableArray.prototype.move = function (fromIndex, toIndex) {
	        function checkIndex(index) {
	            if (index < 0) {
	                throw new Error("[mobx.array] Index out of bounds: " + index + " is negative");
	            }
	            var length = this.$mobx.values.length;
	            if (index >= length) {
	                throw new Error("[mobx.array] Index out of bounds: " + index + " is not smaller than " + length);
	            }
	        }
	        checkIndex.call(this, fromIndex);
	        checkIndex.call(this, toIndex);
	        if (fromIndex === toIndex) {
	            return;
	        }
	        var oldItems = this.$mobx.values;
	        var newItems;
	        if (fromIndex < toIndex) {
	            newItems = oldItems.slice(0, fromIndex).concat(oldItems.slice(fromIndex + 1, toIndex + 1), [
	                oldItems[fromIndex]
	            ], oldItems.slice(toIndex + 1));
	        }
	        else {
	            // toIndex < fromIndex
	            newItems = oldItems.slice(0, toIndex).concat([
	                oldItems[fromIndex]
	            ], oldItems.slice(toIndex, fromIndex), oldItems.slice(fromIndex + 1));
	        }
	        this.replace(newItems);
	    };
	    // See #734, in case property accessors are unreliable...
	    ObservableArray.prototype.get = function (index) {
	        var impl = this.$mobx;
	        if (impl) {
	            if (index < impl.values.length) {
	                impl.atom.reportObserved();
	                return impl.dehanceValue(impl.values[index]);
	            }
	            console.warn("[mobx.array] Attempt to read an array index (" + index + ") that is out of bounds (" + impl
	                .values
	                .length + "). Please check length first. Out of bound indices will not be tracked by MobX");
	        }
	        return undefined;
	    };
	    // See #734, in case property accessors are unreliable...
	    ObservableArray.prototype.set = function (index, newValue) {
	        var adm = this.$mobx;
	        var values = adm.values;
	        if (index < values.length) {
	            // update at index in range
	            checkIfStateModificationsAreAllowed(adm.atom);
	            var oldValue = values[index];
	            if (hasInterceptors(adm)) {
	                var change = interceptChange(adm, {
	                    type: "update",
	                    object: this,
	                    index: index,
	                    newValue: newValue
	                });
	                if (!change)
	                    { return; }
	                newValue = change.newValue;
	            }
	            newValue = adm.enhancer(newValue, oldValue);
	            var changed = newValue !== oldValue;
	            if (changed) {
	                values[index] = newValue;
	                adm.notifyArrayChildUpdate(index, newValue, oldValue);
	            }
	        }
	        else if (index === values.length) {
	            // add a new item
	            adm.spliceWithArray(index, 0, [newValue]);
	        }
	        else {
	            // out of bounds
	            throw new Error("[mobx.array] Index out of bounds, " + index + " is larger than " + values.length);
	        }
	    };
	    return ObservableArray;
	}(StubArray));
	declareIterator(ObservableArray.prototype, function () {
	    return arrayAsIterator(this.slice());
	});
	Object.defineProperty(ObservableArray.prototype, "length", {
	    enumerable: false,
	    configurable: true,
	    get: function () {
	        return this.$mobx.getArrayLength();
	    },
	    set: function (newLength) {
	        this.$mobx.setArrayLength(newLength);
	    }
	});
	[
	    "every",
	    "filter",
	    "forEach",
	    "indexOf",
	    "join",
	    "lastIndexOf",
	    "map",
	    "reduce",
	    "reduceRight",
	    "slice",
	    "some",
	    "toString",
	    "toLocaleString"
	].forEach(function (funcName) {
	    var baseFunc = Array.prototype[funcName];
	    invariant(typeof baseFunc === "function", "Base function not defined on Array prototype: '" + funcName + "'");
	    addHiddenProp(ObservableArray.prototype, funcName, function () {
	        return baseFunc.apply(this.peek(), arguments);
	    });
	});
	/**
	 * We don't want those to show up in `for (const key in ar)` ...
	 */
	makeNonEnumerable(ObservableArray.prototype, [
	    "constructor",
	    "intercept",
	    "observe",
	    "clear",
	    "concat",
	    "get",
	    "replace",
	    "toJS",
	    "toJSON",
	    "peek",
	    "find",
	    "findIndex",
	    "splice",
	    "spliceWithArray",
	    "push",
	    "pop",
	    "set",
	    "shift",
	    "unshift",
	    "reverse",
	    "sort",
	    "remove",
	    "move",
	    "toString",
	    "toLocaleString"
	]);
	// See #364
	var ENTRY_0 = createArrayEntryDescriptor(0);
	function createArrayEntryDescriptor(index) {
	    return {
	        enumerable: false,
	        configurable: false,
	        get: function () {
	            // TODO: Check `this`?, see #752?
	            return this.get(index);
	        },
	        set: function (value) {
	            this.set(index, value);
	        }
	    };
	}
	function createArrayBufferItem(index) {
	    Object.defineProperty(ObservableArray.prototype, "" + index, createArrayEntryDescriptor(index));
	}
	function reserveArrayBuffer(max) {
	    for (var index = OBSERVABLE_ARRAY_BUFFER_SIZE; index < max; index++)
	        { createArrayBufferItem(index); }
	    OBSERVABLE_ARRAY_BUFFER_SIZE = max;
	}
	reserveArrayBuffer(1000);
	var isObservableArrayAdministration = createInstanceofPredicate("ObservableArrayAdministration", ObservableArrayAdministration);
	function isObservableArray(thing) {
	    return isObject(thing) && isObservableArrayAdministration(thing.$mobx);
	}

	var UNCHANGED = {};
	var ObservableValue = /** @class */ (function (_super) {
	    __extends(ObservableValue, _super);
	    function ObservableValue(value, enhancer, name, notifySpy) {
	        if (name === void 0) { name = "ObservableValue@" + getNextId(); }
	        if (notifySpy === void 0) { notifySpy = true; }
	        var _this = _super.call(this, name) || this;
	        _this.enhancer = enhancer;
	        _this.hasUnreportedChange = false;
	        _this.dehancer = undefined;
	        _this.value = enhancer(value, undefined, name);
	        if (notifySpy && isSpyEnabled()) {
	            // only notify spy if this is a stand-alone observable
	            spyReport({ type: "create", object: _this, newValue: _this.value });
	        }
	        return _this;
	    }
	    ObservableValue.prototype.dehanceValue = function (value) {
	        if (this.dehancer !== undefined)
	            { return this.dehancer(value); }
	        return value;
	    };
	    ObservableValue.prototype.set = function (newValue) {
	        var oldValue = this.value;
	        newValue = this.prepareNewValue(newValue);
	        if (newValue !== UNCHANGED) {
	            var notifySpy = isSpyEnabled();
	            if (notifySpy) {
	                spyReportStart({
	                    type: "update",
	                    object: this,
	                    newValue: newValue,
	                    oldValue: oldValue
	                });
	            }
	            this.setNewValue(newValue);
	            if (notifySpy)
	                { spyReportEnd(); }
	        }
	    };
	    ObservableValue.prototype.prepareNewValue = function (newValue) {
	        checkIfStateModificationsAreAllowed(this);
	        if (hasInterceptors(this)) {
	            var change = interceptChange(this, {
	                object: this,
	                type: "update",
	                newValue: newValue
	            });
	            if (!change)
	                { return UNCHANGED; }
	            newValue = change.newValue;
	        }
	        // apply modifier
	        newValue = this.enhancer(newValue, this.value, this.name);
	        return this.value !== newValue ? newValue : UNCHANGED;
	    };
	    ObservableValue.prototype.setNewValue = function (newValue) {
	        var oldValue = this.value;
	        this.value = newValue;
	        this.reportChanged();
	        if (hasListeners(this)) {
	            notifyListeners(this, {
	                type: "update",
	                object: this,
	                newValue: newValue,
	                oldValue: oldValue
	            });
	        }
	    };
	    ObservableValue.prototype.get = function () {
	        this.reportObserved();
	        return this.dehanceValue(this.value);
	    };
	    ObservableValue.prototype.intercept = function (handler) {
	        return registerInterceptor(this, handler);
	    };
	    ObservableValue.prototype.observe = function (listener, fireImmediately) {
	        if (fireImmediately)
	            { listener({
	                object: this,
	                type: "update",
	                newValue: this.value,
	                oldValue: undefined
	            }); }
	        return registerListener(this, listener);
	    };
	    ObservableValue.prototype.toJSON = function () {
	        return this.get();
	    };
	    ObservableValue.prototype.toString = function () {
	        return this.name + "[" + this.value + "]";
	    };
	    ObservableValue.prototype.valueOf = function () {
	        return toPrimitive(this.get());
	    };
	    return ObservableValue;
	}(BaseAtom));
	ObservableValue.prototype[primitiveSymbol()] = ObservableValue.prototype.valueOf;
	var isObservableValue = createInstanceofPredicate("ObservableValue", ObservableValue);

	var messages = {
	    m001: "It is not allowed to assign new values to @action fields",
	    m002: "`runInAction` expects a function",
	    m003: "`runInAction` expects a function without arguments",
	    m004: "autorun expects a function",
	    m005: "Warning: attempted to pass an action to autorun. Actions are untracked and will not trigger on state changes. Use `reaction` or wrap only your state modification code in an action.",
	    m006: "Warning: attempted to pass an action to autorunAsync. Actions are untracked and will not trigger on state changes. Use `reaction` or wrap only your state modification code in an action.",
	    m007: "reaction only accepts 2 or 3 arguments. If migrating from MobX 2, please provide an options object",
	    m008: "wrapping reaction expression in `asReference` is no longer supported, use options object instead",
	    m009: "@computed can only be used on getter functions, like: '@computed get myProps() { return ...; }'. It looks like it was used on a property.",
	    m010: "@computed can only be used on getter functions, like: '@computed get myProps() { return ...; }'",
	    m011: "First argument to `computed` should be an expression. If using computed as decorator, don't pass it arguments",
	    m012: "computed takes one or two arguments if used as function",
	    m013: "[mobx.expr] 'expr' should only be used inside other reactive functions.",
	    m014: "extendObservable expected 2 or more arguments",
	    m015: "extendObservable expects an object as first argument",
	    m016: "extendObservable should not be used on maps, use map.merge instead",
	    m017: "all arguments of extendObservable should be objects",
	    m018: "extending an object with another observable (object) is not supported. Please construct an explicit propertymap, using `toJS` if need. See issue #540",
	    m019: "[mobx.isObservable] isObservable(object, propertyName) is not supported for arrays and maps. Use map.has or array.length instead.",
	    m020: "modifiers can only be used for individual object properties",
	    m021: "observable expects zero or one arguments",
	    m022: "@observable can not be used on getters, use @computed instead",
	    m024: "whyRun() can only be used if a derivation is active, or by passing an computed value / reaction explicitly. If you invoked whyRun from inside a computation; the computation is currently suspended but re-evaluating because somebody requested its value.",
	    m025: "whyRun can only be used on reactions and computed values",
	    m026: "`action` can only be invoked on functions",
	    m028: "It is not allowed to set `useStrict` when a derivation is running",
	    m029: "INTERNAL ERROR only onBecomeUnobserved shouldn't be called twice in a row",
	    m030a: "Since strict-mode is enabled, changing observed observable values outside actions is not allowed. Please wrap the code in an `action` if this change is intended. Tried to modify: ",
	    m030b: "Side effects like changing state are not allowed at this point. Are you trying to modify state from, for example, the render function of a React component? Tried to modify: ",
	    m031: "Computed values are not allowed to cause side effects by changing observables that are already being observed. Tried to modify: ",
	    m032: "* This computation is suspended (not in use by any reaction) and won't run automatically.\n	Didn't expect this computation to be suspended at this point?\n	  1. Make sure this computation is used by a reaction (reaction, autorun, observer).\n	  2. Check whether you are using this computation synchronously (in the same stack as they reaction that needs it).",
	    m033: "`observe` doesn't support the fire immediately property for observable maps.",
	    m034: "`mobx.map` is deprecated, use `new ObservableMap` or `mobx.observable.map` instead",
	    m035: "Cannot make the designated object observable; it is not extensible",
	    m036: "It is not possible to get index atoms from arrays",
	    m037: "Hi there! I'm sorry you have just run into an exception.\nIf your debugger ends up here, know that some reaction (like the render() of an observer component, autorun or reaction)\nthrew an exception and that mobx caught it, to avoid that it brings the rest of your application down.\nThe original cause of the exception (the code that caused this reaction to run (again)), is still in the stack.\n\nHowever, more interesting is the actual stack trace of the error itself.\nHopefully the error is an instanceof Error, because in that case you can inspect the original stack of the error from where it was thrown.\nSee `error.stack` property, or press the very subtle \"(...)\" link you see near the console.error message that probably brought you here.\nThat stack is more interesting than the stack of this console.error itself.\n\nIf the exception you see is an exception you created yourself, make sure to use `throw new Error(\"Oops\")` instead of `throw \"Oops\"`,\nbecause the javascript environment will only preserve the original stack trace in the first form.\n\nYou can also make sure the debugger pauses the next time this very same exception is thrown by enabling \"Pause on caught exception\".\n(Note that it might pause on many other, unrelated exception as well).\n\nIf that all doesn't help you out, feel free to open an issue https://github.com/mobxjs/mobx/issues!\n",
	    m038: "Missing items in this list?\n    1. Check whether all used values are properly marked as observable (use isObservable to verify)\n    2. Make sure you didn't dereference values too early. MobX observes props, not primitives. E.g: use 'person.name' instead of 'name' in your computation.\n"
	};
	function getMessage(id) {
	    return messages[id];
	}

	function createAction(actionName, fn) {
	    invariant(typeof fn === "function", getMessage("m026"));
	    invariant(typeof actionName === "string" && actionName.length > 0, "actions should have valid names, got: '" + actionName + "'");
	    var res = function () {
	        return executeAction(actionName, fn, this, arguments);
	    };
	    res.originalFn = fn;
	    res.isMobxAction = true;
	    return res;
	}
	function executeAction(actionName, fn, scope, args) {
	    var runInfo = startAction(actionName, fn, scope, args);
	    try {
	        return fn.apply(scope, args);
	    }
	    finally {
	        endAction(runInfo);
	    }
	}
	function startAction(actionName, fn, scope, args) {
	    var notifySpy = isSpyEnabled() && !!actionName;
	    var startTime = 0;
	    if (notifySpy) {
	        startTime = Date.now();
	        var l = (args && args.length) || 0;
	        var flattendArgs = new Array(l);
	        if (l > 0)
	            { for (var i = 0; i < l; i++)
	                { flattendArgs[i] = args[i]; } }
	        spyReportStart({
	            type: "action",
	            name: actionName,
	            fn: fn,
	            object: scope,
	            arguments: flattendArgs
	        });
	    }
	    var prevDerivation = untrackedStart();
	    startBatch();
	    var prevAllowStateChanges = allowStateChangesStart(true);
	    return {
	        prevDerivation: prevDerivation,
	        prevAllowStateChanges: prevAllowStateChanges,
	        notifySpy: notifySpy,
	        startTime: startTime
	    };
	}
	function endAction(runInfo) {
	    allowStateChangesEnd(runInfo.prevAllowStateChanges);
	    endBatch();
	    untrackedEnd(runInfo.prevDerivation);
	    if (runInfo.notifySpy)
	        { spyReportEnd({ time: Date.now() - runInfo.startTime }); }
	}
	function useStrict(strict) {
	    invariant(globalState.trackingDerivation === null, getMessage("m028"));
	    globalState.strictMode = strict;
	    globalState.allowStateChanges = !strict;
	}
	function isStrictModeEnabled() {
	    return globalState.strictMode;
	}
	function allowStateChanges(allowStateChanges, func) {
	    // TODO: deprecate / refactor this function in next major
	    // Currently only used by `@observer`
	    // Proposed change: remove first param, rename to `forbidStateChanges`,
	    // require error callback instead of the hardcoded error message now used
	    // Use `inAction` instead of allowStateChanges in derivation.ts to check strictMode
	    var prev = allowStateChangesStart(allowStateChanges);
	    var res;
	    try {
	        res = func();
	    }
	    finally {
	        allowStateChangesEnd(prev);
	    }
	    return res;
	}
	function allowStateChangesStart(allowStateChanges) {
	    var prev = globalState.allowStateChanges;
	    globalState.allowStateChanges = allowStateChanges;
	    return prev;
	}
	function allowStateChangesEnd(prev) {
	    globalState.allowStateChanges = prev;
	}

	/**
	 * Constructs a decorator, that normalizes the differences between
	 * TypeScript and Babel. Mainly caused by the fact that legacy-decorator cannot assign
	 * values during instance creation to properties that have a getter setter.
	 *
	 * - Sigh -
	 *
	 * Also takes care of the difference between @decorator field and @decorator(args) field, and different forms of values.
	 * For performance (cpu and mem) reasons the properties are always defined on the prototype (at least initially).
	 * This means that these properties despite being enumerable might not show up in Object.keys() (but they will show up in for...in loops).
	 */
	function createClassPropertyDecorator(
	/**
	 * This function is invoked once, when the property is added to a new instance.
	 * When this happens is not strictly determined due to differences in TS and Babel:
	 * Typescript: Usually when constructing the new instance
	 * Babel, sometimes Typescript: during the first get / set
	 * Both: when calling `runLazyInitializers(instance)`
	 */
	onInitialize, get, set, enumerable, 
	/**
	 * Can this decorator invoked with arguments? e.g. @decorator(args)
	 */
	allowCustomArguments) {
	    function classPropertyDecorator(target, key, descriptor, customArgs, argLen) {
	        if (argLen === void 0) { argLen = 0; }
	        invariant(allowCustomArguments || quacksLikeADecorator(arguments), "This function is a decorator, but it wasn't invoked like a decorator");
	        if (!descriptor) {
	            // typescript (except for getter / setters)
	            var newDescriptor = {
	                enumerable: enumerable,
	                configurable: true,
	                get: function () {
	                    if (!this.__mobxInitializedProps || this.__mobxInitializedProps[key] !== true)
	                        { typescriptInitializeProperty(this, key, undefined, onInitialize, customArgs, descriptor); }
	                    return get.call(this, key);
	                },
	                set: function (v) {
	                    if (!this.__mobxInitializedProps || this.__mobxInitializedProps[key] !== true) {
	                        typescriptInitializeProperty(this, key, v, onInitialize, customArgs, descriptor);
	                    }
	                    else {
	                        set.call(this, key, v);
	                    }
	                }
	            };
	            if (arguments.length < 3 || (arguments.length === 5 && argLen < 3)) {
	                // Typescript target is ES3, so it won't define property for us
	                // or using Reflect.decorate polyfill, which will return no descriptor
	                // (see https://github.com/mobxjs/mobx/issues/333)
	                Object.defineProperty(target, key, newDescriptor);
	            }
	            return newDescriptor;
	        }
	        else {
	            // babel and typescript getter / setter props
	            if (!hasOwnProperty(target, "__mobxLazyInitializers")) {
	                addHiddenProp(target, "__mobxLazyInitializers", (target.__mobxLazyInitializers && target.__mobxLazyInitializers.slice()) || [] // support inheritance
	                );
	            }
	            var value_1 = descriptor.value, initializer_1 = descriptor.initializer;
	            target.__mobxLazyInitializers.push(function (instance) {
	                onInitialize(instance, key, initializer_1 ? initializer_1.call(instance) : value_1, customArgs, descriptor);
	            });
	            return {
	                enumerable: enumerable,
	                configurable: true,
	                get: function () {
	                    if (this.__mobxDidRunLazyInitializers !== true)
	                        { runLazyInitializers(this); }
	                    return get.call(this, key);
	                },
	                set: function (v) {
	                    if (this.__mobxDidRunLazyInitializers !== true)
	                        { runLazyInitializers(this); }
	                    set.call(this, key, v);
	                }
	            };
	        }
	    }
	    if (allowCustomArguments) {
	        /** If custom arguments are allowed, we should return a function that returns a decorator */
	        return function () {
	            /** Direct invocation: @decorator bla */
	            if (quacksLikeADecorator(arguments))
	                { return classPropertyDecorator.apply(null, arguments); }
	            /** Indirect invocation: @decorator(args) bla */
	            var outerArgs = arguments;
	            var argLen = arguments.length;
	            return function (target, key, descriptor) {
	                return classPropertyDecorator(target, key, descriptor, outerArgs, argLen);
	            };
	        };
	    }
	    return classPropertyDecorator;
	}
	function typescriptInitializeProperty(instance, key, v, onInitialize, customArgs, baseDescriptor) {
	    if (!hasOwnProperty(instance, "__mobxInitializedProps"))
	        { addHiddenProp(instance, "__mobxInitializedProps", {}); }
	    instance.__mobxInitializedProps[key] = true;
	    onInitialize(instance, key, v, customArgs, baseDescriptor);
	}
	function runLazyInitializers(instance) {
	    if (instance.__mobxDidRunLazyInitializers === true)
	        { return; }
	    if (instance.__mobxLazyInitializers) {
	        addHiddenProp(instance, "__mobxDidRunLazyInitializers", true);
	        instance.__mobxDidRunLazyInitializers &&
	            instance.__mobxLazyInitializers.forEach(function (initializer) { return initializer(instance); });
	    }
	}
	function quacksLikeADecorator(args) {
	    return (args.length === 2 || args.length === 3) && typeof args[1] === "string";
	}

	var actionFieldDecorator = createClassPropertyDecorator(function (target, key, value, args, originalDescriptor) {
	    var actionName = args && args.length === 1 ? args[0] : value.name || key || "<unnamed action>";
	    var wrappedAction = action(actionName, value);
	    addHiddenProp(target, key, wrappedAction);
	}, function (key) {
	    return this[key];
	}, function () {
	    invariant(false, getMessage("m001"));
	}, false, true);
	var boundActionDecorator = createClassPropertyDecorator(function (target, key, value) {
	    defineBoundAction(target, key, value);
	}, function (key) {
	    return this[key];
	}, function () {
	    invariant(false, getMessage("m001"));
	}, false, false);
	var action = function action(arg1, arg2, arg3, arg4) {
	    if (arguments.length === 1 && typeof arg1 === "function")
	        { return createAction(arg1.name || "<unnamed action>", arg1); }
	    if (arguments.length === 2 && typeof arg2 === "function")
	        { return createAction(arg1, arg2); }
	    if (arguments.length === 1 && typeof arg1 === "string")
	        { return namedActionDecorator(arg1); }
	    return namedActionDecorator(arg2).apply(null, arguments);
	};
	action.bound = function boundAction(arg1, arg2, arg3) {
	    if (typeof arg1 === "function") {
	        var action_1 = createAction("<not yet bound action>", arg1);
	        action_1.autoBind = true;
	        return action_1;
	    }
	    return boundActionDecorator.apply(null, arguments);
	};
	function namedActionDecorator(name) {
	    return function (target, prop, descriptor) {
	        if (descriptor && typeof descriptor.value === "function") {
	            // TypeScript @action method() { }. Defined on proto before being decorated
	            // Don't use the field decorator if we are just decorating a method
	            descriptor.value = createAction(name, descriptor.value);
	            descriptor.enumerable = false;
	            descriptor.configurable = true;
	            return descriptor;
	        }
	        if (descriptor !== undefined && descriptor.get !== undefined) {
	            throw new Error("[mobx] action is not expected to be used with getters");
	        }
	        // bound instance methods
	        return actionFieldDecorator(name).apply(this, arguments);
	    };
	}
	function runInAction(arg1, arg2, arg3) {
	    var actionName = typeof arg1 === "string" ? arg1 : arg1.name || "<unnamed action>";
	    var fn = typeof arg1 === "function" ? arg1 : arg2;
	    var scope = typeof arg1 === "function" ? arg2 : arg3;
	    invariant(typeof fn === "function", getMessage("m002"));
	    invariant(fn.length === 0, getMessage("m003"));
	    invariant(typeof actionName === "string" && actionName.length > 0, "actions should have valid names, got: '" + actionName + "'");
	    return executeAction(actionName, fn, scope, undefined);
	}
	function isAction(thing) {
	    return typeof thing === "function" && thing.isMobxAction === true;
	}
	function defineBoundAction(target, propertyName, fn) {
	    var res = function () {
	        return executeAction(propertyName, fn, target, arguments);
	    };
	    res.isMobxAction = true;
	    addHiddenProp(target, propertyName, res);
	}

	var toString = Object.prototype.toString;
	function deepEqual(a, b) {
	    return eq(a, b);
	}
	// Copied from https://github.com/jashkenas/underscore/blob/5c237a7c682fb68fd5378203f0bf22dce1624854/underscore.js#L1186-L1289
	// Internal recursive comparison function for `isEqual`.
	function eq(a, b, aStack, bStack) {
	    // Identical objects are equal. `0 === -0`, but they aren't identical.
	    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
	    if (a === b)
	        { return a !== 0 || 1 / a === 1 / b; }
	    // `null` or `undefined` only equal to itself (strict comparison).
	    if (a == null || b == null)
	        { return false; }
	    // `NaN`s are equivalent, but non-reflexive.
	    if (a !== a)
	        { return b !== b; }
	    // Exhaust primitive checks
	    var type = typeof a;
	    if (type !== "function" && type !== "object" && typeof b != "object")
	        { return false; }
	    return deepEq(a, b, aStack, bStack);
	}
	// Internal recursive comparison function for `isEqual`.
	function deepEq(a, b, aStack, bStack) {
	    // Unwrap any wrapped objects.
	    a = unwrap(a);
	    b = unwrap(b);
	    // Compare `[[Class]]` names.
	    var className = toString.call(a);
	    if (className !== toString.call(b))
	        { return false; }
	    switch (className) {
	        // Strings, numbers, regular expressions, dates, and booleans are compared by value.
	        case "[object RegExp]":
	        // RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')
	        case "[object String]":
	            // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
	            // equivalent to `new String("5")`.
	            return "" + a === "" + b;
	        case "[object Number]":
	            // `NaN`s are equivalent, but non-reflexive.
	            // Object(NaN) is equivalent to NaN.
	            if (+a !== +a)
	                { return +b !== +b; }
	            // An `egal` comparison is performed for other numeric values.
	            return +a === 0 ? 1 / +a === 1 / b : +a === +b;
	        case "[object Date]":
	        case "[object Boolean]":
	            // Coerce dates and booleans to numeric primitive values. Dates are compared by their
	            // millisecond representations. Note that invalid dates with millisecond representations
	            // of `NaN` are not equivalent.
	            return +a === +b;
	        case "[object Symbol]":
	            return (typeof Symbol !== "undefined" && Symbol.valueOf.call(a) === Symbol.valueOf.call(b));
	    }
	    var areArrays = className === "[object Array]";
	    if (!areArrays) {
	        if (typeof a != "object" || typeof b != "object")
	            { return false; }
	        // Objects with different constructors are not equivalent, but `Object`s or `Array`s
	        // from different frames are.
	        var aCtor = a.constructor, bCtor = b.constructor;
	        if (aCtor !== bCtor &&
	            !(typeof aCtor === "function" &&
	                aCtor instanceof aCtor &&
	                typeof bCtor === "function" &&
	                bCtor instanceof bCtor) &&
	            ("constructor" in a && "constructor" in b)) {
	            return false;
	        }
	    }
	    // Assume equality for cyclic structures. The algorithm for detecting cyclic
	    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
	    // Initializing stack of traversed objects.
	    // It's done here since we only need them for objects and arrays comparison.
	    aStack = aStack || [];
	    bStack = bStack || [];
	    var length = aStack.length;
	    while (length--) {
	        // Linear search. Performance is inversely proportional to the number of
	        // unique nested structures.
	        if (aStack[length] === a)
	            { return bStack[length] === b; }
	    }
	    // Add the first object to the stack of traversed objects.
	    aStack.push(a);
	    bStack.push(b);
	    // Recursively compare objects and arrays.
	    if (areArrays) {
	        // Compare array lengths to determine if a deep comparison is necessary.
	        length = a.length;
	        if (length !== b.length)
	            { return false; }
	        // Deep compare the contents, ignoring non-numeric properties.
	        while (length--) {
	            if (!eq(a[length], b[length], aStack, bStack))
	                { return false; }
	        }
	    }
	    else {
	        // Deep compare objects.
	        var keys = Object.keys(a), key;
	        length = keys.length;
	        // Ensure that both objects contain the same number of properties before comparing deep equality.
	        if (Object.keys(b).length !== length)
	            { return false; }
	        while (length--) {
	            // Deep compare each member
	            key = keys[length];
	            if (!(has(b, key) && eq(a[key], b[key], aStack, bStack)))
	                { return false; }
	        }
	    }
	    // Remove the first object from the stack of traversed objects.
	    aStack.pop();
	    bStack.pop();
	    return true;
	}
	function unwrap(a) {
	    if (isObservableArray(a))
	        { return a.peek(); }
	    if (isObservableMap(a))
	        { return a.entries(); }
	    if (isES6Map(a))
	        { return iteratorToArray(a.entries()); }
	    return a;
	}
	function has(a, key) {
	    return Object.prototype.hasOwnProperty.call(a, key);
	}

	function identityComparer(a, b) {
	    return a === b;
	}
	function structuralComparer(a, b) {
	    return deepEqual(a, b);
	}
	function defaultComparer(a, b) {
	    return areBothNaN(a, b) || identityComparer(a, b);
	}
	var comparer = {
	    identity: identityComparer,
	    structural: structuralComparer,
	    default: defaultComparer
	};

	function autorun(arg1, arg2, arg3) {
	    var name, view, scope;
	    if (typeof arg1 === "string") {
	        name = arg1;
	        view = arg2;
	        scope = arg3;
	    }
	    else {
	        name = arg1.name || "Autorun@" + getNextId();
	        view = arg1;
	        scope = arg2;
	    }
	    invariant(typeof view === "function", getMessage("m004"));
	    invariant(isAction(view) === false, getMessage("m005"));
	    if (scope)
	        { view = view.bind(scope); }
	    var reaction = new Reaction(name, function () {
	        this.track(reactionRunner);
	    });
	    function reactionRunner() {
	        view(reaction);
	    }
	    reaction.schedule();
	    return reaction.getDisposer();
	}
	function when(arg1, arg2, arg3, arg4) {
	    var name, predicate, effect, scope;
	    if (typeof arg1 === "string") {
	        name = arg1;
	        predicate = arg2;
	        effect = arg3;
	        scope = arg4;
	    }
	    else {
	        name = "When@" + getNextId();
	        predicate = arg1;
	        effect = arg2;
	        scope = arg3;
	    }
	    var disposer = autorun(name, function (r) {
	        if (predicate.call(scope)) {
	            r.dispose();
	            var prevUntracked = untrackedStart();
	            effect.call(scope);
	            untrackedEnd(prevUntracked);
	        }
	    });
	    return disposer;
	}
	function autorunAsync(arg1, arg2, arg3, arg4) {
	    var name, func, delay, scope;
	    if (typeof arg1 === "string") {
	        name = arg1;
	        func = arg2;
	        delay = arg3;
	        scope = arg4;
	    }
	    else {
	        name = arg1.name || "AutorunAsync@" + getNextId();
	        func = arg1;
	        delay = arg2;
	        scope = arg3;
	    }
	    invariant(isAction(func) === false, getMessage("m006"));
	    if (delay === void 0)
	        { delay = 1; }
	    if (scope)
	        { func = func.bind(scope); }
	    var isScheduled = false;
	    var r = new Reaction(name, function () {
	        if (!isScheduled) {
	            isScheduled = true;
	            setTimeout(function () {
	                isScheduled = false;
	                if (!r.isDisposed)
	                    { r.track(reactionRunner); }
	            }, delay);
	        }
	    });
	    function reactionRunner() {
	        func(r);
	    }
	    r.schedule();
	    return r.getDisposer();
	}
	function reaction(expression, effect, arg3) {
	    if (arguments.length > 3) {
	        fail(getMessage("m007"));
	    }
	    if (isModifierDescriptor(expression)) {
	        fail(getMessage("m008"));
	    }
	    var opts;
	    if (typeof arg3 === "object") {
	        opts = arg3;
	    }
	    else {
	        opts = {};
	    }
	    opts.name =
	        opts.name || expression.name || effect.name || "Reaction@" + getNextId();
	    opts.fireImmediately = arg3 === true || opts.fireImmediately === true;
	    opts.delay = opts.delay || 0;
	    opts.compareStructural = opts.compareStructural || opts.struct || false;
	    // TODO: creates ugly spy events, use `effect = (r) => runInAction(opts.name, () => effect(r))` instead
	    effect = action(opts.name, opts.context ? effect.bind(opts.context) : effect);
	    if (opts.context) {
	        expression = expression.bind(opts.context);
	    }
	    var firstTime = true;
	    var isScheduled = false;
	    var value;
	    var equals = opts.equals
	        ? opts.equals
	        : opts.compareStructural || opts.struct ? comparer.structural : comparer.default;
	    var r = new Reaction(opts.name, function () {
	        if (firstTime || opts.delay < 1) {
	            reactionRunner();
	        }
	        else if (!isScheduled) {
	            isScheduled = true;
	            setTimeout(function () {
	                isScheduled = false;
	                reactionRunner();
	            }, opts.delay);
	        }
	    });
	    function reactionRunner() {
	        if (r.isDisposed)
	            { return; }
	        var changed = false;
	        r.track(function () {
	            var nextValue = expression(r);
	            changed = firstTime || !equals(value, nextValue);
	            value = nextValue;
	        });
	        if (firstTime && opts.fireImmediately)
	            { effect(value, r); }
	        if (!firstTime && changed === true)
	            { effect(value, r); }
	        if (firstTime)
	            { firstTime = false; }
	    }
	    r.schedule();
	    return r.getDisposer();
	}

	/**
	 * A node in the state dependency root that observes other nodes, and can be observed itself.
	 *
	 * ComputedValue will remember the result of the computation for the duration of the batch, or
	 * while being observed.
	 *
	 * During this time it will recompute only when one of its direct dependencies changed,
	 * but only when it is being accessed with `ComputedValue.get()`.
	 *
	 * Implementation description:
	 * 1. First time it's being accessed it will compute and remember result
	 *    give back remembered result until 2. happens
	 * 2. First time any deep dependency change, propagate POSSIBLY_STALE to all observers, wait for 3.
	 * 3. When it's being accessed, recompute if any shallow dependency changed.
	 *    if result changed: propagate STALE to all observers, that were POSSIBLY_STALE from the last step.
	 *    go to step 2. either way
	 *
	 * If at any point it's outside batch and it isn't observed: reset everything and go to 1.
	 */
	var ComputedValue = /** @class */ (function () {
	    /**
	     * Create a new computed value based on a function expression.
	     *
	     * The `name` property is for debug purposes only.
	     *
	     * The `equals` property specifies the comparer function to use to determine if a newly produced
	     * value differs from the previous value. Two comparers are provided in the library; `defaultComparer`
	     * compares based on identity comparison (===), and `structualComparer` deeply compares the structure.
	     * Structural comparison can be convenient if you always produce an new aggregated object and
	     * don't want to notify observers if it is structurally the same.
	     * This is useful for working with vectors, mouse coordinates etc.
	     */
	    function ComputedValue(derivation, scope, equals, name, setter) {
	        this.derivation = derivation;
	        this.scope = scope;
	        this.equals = equals;
	        this.dependenciesState = IDerivationState.NOT_TRACKING;
	        this.observing = []; // nodes we are looking at. Our value depends on these nodes
	        this.newObserving = null; // during tracking it's an array with new observed observers
	        this.isPendingUnobservation = false;
	        this.observers = [];
	        this.observersIndexes = {};
	        this.diffValue = 0;
	        this.runId = 0;
	        this.lastAccessedBy = 0;
	        this.lowestObserverState = IDerivationState.UP_TO_DATE;
	        this.unboundDepsCount = 0;
	        this.__mapid = "#" + getNextId();
	        this.value = new CaughtException(null);
	        this.isComputing = false; // to check for cycles
	        this.isRunningSetter = false;
	        this.isTracing = TraceMode.NONE;
	        this.name = name || "ComputedValue@" + getNextId();
	        if (setter)
	            { this.setter = createAction(name + "-setter", setter); }
	    }
	    ComputedValue.prototype.onBecomeStale = function () {
	        propagateMaybeChanged(this);
	    };
	    ComputedValue.prototype.onBecomeUnobserved = function () {
	        clearObserving(this);
	        this.value = undefined;
	    };
	    /**
	     * Returns the current value of this computed value.
	     * Will evaluate its computation first if needed.
	     */
	    ComputedValue.prototype.get = function () {
	        invariant(!this.isComputing, "Cycle detected in computation " + this.name, this.derivation);
	        if (globalState.inBatch === 0) {
	            // This is an minor optimization which could be omitted to simplify the code
	            // The computedValue is accessed outside of any mobx stuff. Batch observing should be enough and don't need
	            // tracking as it will never be called again inside this batch.
	            startBatch();
	            if (shouldCompute(this)) {
	                if (this.isTracing !== TraceMode.NONE) {
	                    console.log("[mobx.trace] '" + this
	                        .name + "' is being read outside a reactive context and doing a full recompute");
	                }
	                this.value = this.computeValue(false);
	            }
	            endBatch();
	        }
	        else {
	            reportObserved(this);
	            if (shouldCompute(this))
	                { if (this.trackAndCompute())
	                    { propagateChangeConfirmed(this); } }
	        }
	        var result = this.value;
	        if (isCaughtException(result))
	            { throw result.cause; }
	        return result;
	    };
	    ComputedValue.prototype.peek = function () {
	        var res = this.computeValue(false);
	        if (isCaughtException(res))
	            { throw res.cause; }
	        return res;
	    };
	    ComputedValue.prototype.set = function (value) {
	        if (this.setter) {
	            invariant(!this.isRunningSetter, "The setter of computed value '" + this
	                .name + "' is trying to update itself. Did you intend to update an _observable_ value, instead of the computed property?");
	            this.isRunningSetter = true;
	            try {
	                this.setter.call(this.scope, value);
	            }
	            finally {
	                this.isRunningSetter = false;
	            }
	        }
	        else
	            { invariant(false, "[ComputedValue '" + this
	                .name + "'] It is not possible to assign a new value to a computed value."); }
	    };
	    ComputedValue.prototype.trackAndCompute = function () {
	        if (isSpyEnabled()) {
	            spyReport({
	                object: this.scope,
	                type: "compute",
	                fn: this.derivation
	            });
	        }
	        var oldValue = this.value;
	        var wasSuspended = 
	        /* see #1208 */ this.dependenciesState === IDerivationState.NOT_TRACKING;
	        var newValue = (this.value = this.computeValue(true));
	        return (wasSuspended ||
	            isCaughtException(oldValue) ||
	            isCaughtException(newValue) ||
	            !this.equals(oldValue, newValue));
	    };
	    ComputedValue.prototype.computeValue = function (track) {
	        this.isComputing = true;
	        globalState.computationDepth++;
	        var res;
	        if (track) {
	            res = trackDerivedFunction(this, this.derivation, this.scope);
	        }
	        else {
	            try {
	                res = this.derivation.call(this.scope);
	            }
	            catch (e) {
	                res = new CaughtException(e);
	            }
	        }
	        globalState.computationDepth--;
	        this.isComputing = false;
	        return res;
	    };
	    ComputedValue.prototype.observe = function (listener, fireImmediately) {
	        var _this = this;
	        var firstTime = true;
	        var prevValue = undefined;
	        return autorun(function () {
	            var newValue = _this.get();
	            if (!firstTime || fireImmediately) {
	                var prevU = untrackedStart();
	                listener({
	                    type: "update",
	                    object: _this,
	                    newValue: newValue,
	                    oldValue: prevValue
	                });
	                untrackedEnd(prevU);
	            }
	            firstTime = false;
	            prevValue = newValue;
	        });
	    };
	    ComputedValue.prototype.toJSON = function () {
	        return this.get();
	    };
	    ComputedValue.prototype.toString = function () {
	        return this.name + "[" + this.derivation.toString() + "]";
	    };
	    ComputedValue.prototype.valueOf = function () {
	        return toPrimitive(this.get());
	    };
	    ComputedValue.prototype.whyRun = function () {
	        var isTracking = Boolean(globalState.trackingDerivation);
	        var observing = unique(this.isComputing ? this.newObserving : this.observing).map(function (dep) { return dep.name; });
	        var observers = unique(getObservers(this).map(function (dep) { return dep.name; }));
	        return ("\nWhyRun? computation '" + this.name + "':\n * Running because: " + (isTracking
	            ? "[active] the value of this computation is needed by a reaction"
	            : this.isComputing
	                ? "[get] The value of this computed was requested outside a reaction"
	                : "[idle] not running at the moment") + "\n" +
	            (this.dependenciesState === IDerivationState.NOT_TRACKING
	                ? getMessage("m032")
	                : " * This computation will re-run if any of the following observables changes:\n    " + joinStrings(observing) + "\n    " + (this.isComputing && isTracking
	                    ? " (... or any observable accessed during the remainder of the current run)"
	                    : "") + "\n    " + getMessage("m038") + "\n\n  * If the outcome of this computation changes, the following observers will be re-run:\n    " + joinStrings(observers) + "\n"));
	    };
	    return ComputedValue;
	}());
	ComputedValue.prototype[primitiveSymbol()] = ComputedValue.prototype.valueOf;
	var isComputedValue = createInstanceofPredicate("ComputedValue", ComputedValue);

	var ObservableObjectAdministration = /** @class */ (function () {
	    function ObservableObjectAdministration(target, name) {
	        this.target = target;
	        this.name = name;
	        this.values = {};
	        this.changeListeners = null;
	        this.interceptors = null;
	    }
	    /**
	     * Observes this object. Triggers for the events 'add', 'update' and 'delete'.
	     * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/observe
	     * for callback details
	     */
	    ObservableObjectAdministration.prototype.observe = function (callback, fireImmediately) {
	        invariant(fireImmediately !== true, "`observe` doesn't support the fire immediately property for observable objects.");
	        return registerListener(this, callback);
	    };
	    ObservableObjectAdministration.prototype.intercept = function (handler) {
	        return registerInterceptor(this, handler);
	    };
	    return ObservableObjectAdministration;
	}());
	function asObservableObject(target, name) {
	    if (isObservableObject(target) && target.hasOwnProperty("$mobx"))
	        { return target.$mobx; }
	    invariant(Object.isExtensible(target), getMessage("m035"));
	    if (!isPlainObject(target))
	        { name = (target.constructor.name || "ObservableObject") + "@" + getNextId(); }
	    if (!name)
	        { name = "ObservableObject@" + getNextId(); }
	    var adm = new ObservableObjectAdministration(target, name);
	    addHiddenFinalProp(target, "$mobx", adm);
	    return adm;
	}
	function defineObservablePropertyFromDescriptor(adm, propName, descriptor, defaultEnhancer) {
	    if (adm.values[propName] && !isComputedValue(adm.values[propName])) {
	        // already observable property
	        invariant("value" in descriptor, "The property " + propName + " in " + adm.name + " is already observable, cannot redefine it as computed property");
	        adm.target[propName] = descriptor.value; // the property setter will make 'value' reactive if needed.
	        return;
	    }
	    // not yet observable property
	    if ("value" in descriptor) {
	        // not a computed value
	        if (isModifierDescriptor(descriptor.value)) {
	            // x : ref(someValue)
	            var modifierDescriptor = descriptor.value;
	            defineObservableProperty(adm, propName, modifierDescriptor.initialValue, modifierDescriptor.enhancer);
	        }
	        else if (isAction(descriptor.value) && descriptor.value.autoBind === true) {
	            defineBoundAction(adm.target, propName, descriptor.value.originalFn);
	        }
	        else if (isComputedValue(descriptor.value)) {
	            // x: computed(someExpr)
	            defineComputedPropertyFromComputedValue(adm, propName, descriptor.value);
	        }
	        else {
	            // x: someValue
	            defineObservableProperty(adm, propName, descriptor.value, defaultEnhancer);
	        }
	    }
	    else {
	        // get x() { return 3 } set x(v) { }
	        defineComputedProperty(adm, propName, descriptor.get, descriptor.set, comparer.default, true);
	    }
	}
	function defineObservableProperty(adm, propName, newValue, enhancer) {
	    assertPropertyConfigurable(adm.target, propName);
	    if (hasInterceptors(adm)) {
	        var change = interceptChange(adm, {
	            object: adm.target,
	            name: propName,
	            type: "add",
	            newValue: newValue
	        });
	        if (!change)
	            { return; }
	        newValue = change.newValue;
	    }
	    var observable = (adm.values[propName] = new ObservableValue(newValue, enhancer, adm.name + "." + propName, false));
	    newValue = observable.value; // observableValue might have changed it
	    Object.defineProperty(adm.target, propName, generateObservablePropConfig(propName));
	    notifyPropertyAddition(adm, adm.target, propName, newValue);
	}
	function defineComputedProperty(adm, propName, getter, setter, equals, asInstanceProperty) {
	    if (asInstanceProperty)
	        { assertPropertyConfigurable(adm.target, propName); }
	    adm.values[propName] = new ComputedValue(getter, adm.target, equals, adm.name + "." + propName, setter);
	    if (asInstanceProperty) {
	        Object.defineProperty(adm.target, propName, generateComputedPropConfig(propName));
	    }
	}
	function defineComputedPropertyFromComputedValue(adm, propName, computedValue) {
	    var name = adm.name + "." + propName;
	    computedValue.name = name;
	    if (!computedValue.scope)
	        { computedValue.scope = adm.target; }
	    adm.values[propName] = computedValue;
	    Object.defineProperty(adm.target, propName, generateComputedPropConfig(propName));
	}
	var observablePropertyConfigs = {};
	var computedPropertyConfigs = {};
	function generateObservablePropConfig(propName) {
	    return (observablePropertyConfigs[propName] ||
	        (observablePropertyConfigs[propName] = {
	            configurable: true,
	            enumerable: true,
	            get: function () {
	                return this.$mobx.values[propName].get();
	            },
	            set: function (v) {
	                setPropertyValue(this, propName, v);
	            }
	        }));
	}
	function generateComputedPropConfig(propName) {
	    return (computedPropertyConfigs[propName] ||
	        (computedPropertyConfigs[propName] = {
	            configurable: true,
	            enumerable: false,
	            get: function () {
	                return this.$mobx.values[propName].get();
	            },
	            set: function (v) {
	                return this.$mobx.values[propName].set(v);
	            }
	        }));
	}
	function setPropertyValue(instance, name, newValue) {
	    var adm = instance.$mobx;
	    var observable = adm.values[name];
	    // intercept
	    if (hasInterceptors(adm)) {
	        var change = interceptChange(adm, {
	            type: "update",
	            object: instance,
	            name: name,
	            newValue: newValue
	        });
	        if (!change)
	            { return; }
	        newValue = change.newValue;
	    }
	    newValue = observable.prepareNewValue(newValue);
	    // notify spy & observers
	    if (newValue !== UNCHANGED) {
	        var notify = hasListeners(adm);
	        var notifySpy = isSpyEnabled();
	        var change = notify || notifySpy
	            ? {
	                type: "update",
	                object: instance,
	                oldValue: observable.value,
	                name: name,
	                newValue: newValue
	            }
	            : null;
	        if (notifySpy)
	            { spyReportStart(change); }
	        observable.setNewValue(newValue);
	        if (notify)
	            { notifyListeners(adm, change); }
	        if (notifySpy)
	            { spyReportEnd(); }
	    }
	}
	function notifyPropertyAddition(adm, object, name, newValue) {
	    var notify = hasListeners(adm);
	    var notifySpy = isSpyEnabled();
	    var change = notify || notifySpy
	        ? {
	            type: "add",
	            object: object,
	            name: name,
	            newValue: newValue
	        }
	        : null;
	    if (notifySpy)
	        { spyReportStart(change); }
	    if (notify)
	        { notifyListeners(adm, change); }
	    if (notifySpy)
	        { spyReportEnd(); }
	}
	var isObservableObjectAdministration = createInstanceofPredicate("ObservableObjectAdministration", ObservableObjectAdministration);
	function isObservableObject(thing) {
	    if (isObject(thing)) {
	        // Initializers run lazily when transpiling to babel, so make sure they are run...
	        runLazyInitializers(thing);
	        return isObservableObjectAdministration(thing.$mobx);
	    }
	    return false;
	}

	/**
	 * Returns true if the provided value is reactive.
	 * @param value object, function or array
	 * @param property if property is specified, checks whether value.property is reactive.
	 */
	function isObservable(value, property) {
	    if (value === null || value === undefined)
	        { return false; }
	    if (property !== undefined) {
	        if (isObservableArray(value) || isObservableMap(value))
	            { throw new Error(getMessage("m019")); }
	        else if (isObservableObject(value)) {
	            var o = value.$mobx;
	            return o.values && !!o.values[property];
	        }
	        return false;
	    }
	    // For first check, see #701
	    return (isObservableObject(value) ||
	        !!value.$mobx ||
	        isAtom(value) ||
	        isReaction(value) ||
	        isComputedValue(value));
	}

	function createDecoratorForEnhancer(enhancer) {
	    invariant(!!enhancer, ":(");
	    return createClassPropertyDecorator(function (target, name, baseValue, _, baseDescriptor) {
	        assertPropertyConfigurable(target, name);
	        invariant(!baseDescriptor || !baseDescriptor.get, getMessage("m022"));
	        var adm = asObservableObject(target, undefined);
	        defineObservableProperty(adm, name, baseValue, enhancer);
	    }, function (name) {
	        var observable = this.$mobx.values[name];
	        if (observable === undefined // See #505
	        )
	            { return undefined; }
	        return observable.get();
	    }, function (name, value) {
	        setPropertyValue(this, name, value);
	    }, true, false);
	}

	function extendObservable(target) {
	    var arguments$1 = arguments;

	    var properties = [];
	    for (var _i = 1; _i < arguments.length; _i++) {
	        properties[_i - 1] = arguments$1[_i];
	    }
	    return extendObservableHelper(target, deepEnhancer, properties);
	}
	function extendShallowObservable(target) {
	    var arguments$1 = arguments;

	    var properties = [];
	    for (var _i = 1; _i < arguments.length; _i++) {
	        properties[_i - 1] = arguments$1[_i];
	    }
	    return extendObservableHelper(target, referenceEnhancer, properties);
	}
	function extendObservableHelper(target, defaultEnhancer, properties) {
	    invariant(arguments.length >= 2, getMessage("m014"));
	    invariant(typeof target === "object", getMessage("m015"));
	    invariant(!isObservableMap(target), getMessage("m016"));
	    properties.forEach(function (propSet) {
	        invariant(typeof propSet === "object", getMessage("m017"));
	        invariant(!isObservable(propSet), getMessage("m018"));
	    });
	    var adm = asObservableObject(target);
	    var definedProps = {};
	    // Note could be optimised if properties.length === 1
	    for (var i = properties.length - 1; i >= 0; i--) {
	        var propSet = properties[i];
	        for (var key in propSet)
	            { if (definedProps[key] !== true && hasOwnProperty(propSet, key)) {
	                definedProps[key] = true;
	                if (target === propSet && !isPropertyConfigurable(target, key))
	                    { continue; } // see #111, skip non-configurable or non-writable props for `observable(object)`.
	                var descriptor = Object.getOwnPropertyDescriptor(propSet, key);
	                defineObservablePropertyFromDescriptor(adm, key, descriptor, defaultEnhancer);
	            } }
	    }
	    return target;
	}

	var deepDecorator = createDecoratorForEnhancer(deepEnhancer);
	var shallowDecorator = createDecoratorForEnhancer(shallowEnhancer);
	var refDecorator = createDecoratorForEnhancer(referenceEnhancer);
	var deepStructDecorator = createDecoratorForEnhancer(deepStructEnhancer);
	var refStructDecorator = createDecoratorForEnhancer(refStructEnhancer);
	/**
	 * Turns an object, array or function into a reactive structure.
	 * @param v the value which should become observable.
	 */
	function createObservable(v) {
	    if (v === void 0) { v = undefined; }
	    // @observable someProp;
	    if (typeof arguments[1] === "string")
	        { return deepDecorator.apply(null, arguments); }
	    invariant(arguments.length <= 1, getMessage("m021"));
	    invariant(!isModifierDescriptor(v), getMessage("m020"));
	    // it is an observable already, done
	    if (isObservable(v))
	        { return v; }
	    // something that can be converted and mutated?
	    var res = deepEnhancer(v, undefined, undefined);
	    // this value could be converted to a new observable data structure, return it
	    if (res !== v)
	        { return res; }
	    // otherwise, just box it
	    return observable.box(v);
	}
	var observableFactories = {
	    box: function (value, name) {
	        if (arguments.length > 2)
	            { incorrectlyUsedAsDecorator("box"); }
	        return new ObservableValue(value, deepEnhancer, name);
	    },
	    shallowBox: function (value, name) {
	        if (arguments.length > 2)
	            { incorrectlyUsedAsDecorator("shallowBox"); }
	        return new ObservableValue(value, referenceEnhancer, name);
	    },
	    array: function (initialValues, name) {
	        if (arguments.length > 2)
	            { incorrectlyUsedAsDecorator("array"); }
	        return new ObservableArray(initialValues, deepEnhancer, name);
	    },
	    shallowArray: function (initialValues, name) {
	        if (arguments.length > 2)
	            { incorrectlyUsedAsDecorator("shallowArray"); }
	        return new ObservableArray(initialValues, referenceEnhancer, name);
	    },
	    map: function (initialValues, name) {
	        if (arguments.length > 2)
	            { incorrectlyUsedAsDecorator("map"); }
	        return new ObservableMap(initialValues, deepEnhancer, name);
	    },
	    shallowMap: function (initialValues, name) {
	        if (arguments.length > 2)
	            { incorrectlyUsedAsDecorator("shallowMap"); }
	        return new ObservableMap(initialValues, referenceEnhancer, name);
	    },
	    object: function (props, name) {
	        if (arguments.length > 2)
	            { incorrectlyUsedAsDecorator("object"); }
	        var res = {};
	        // convert to observable object
	        asObservableObject(res, name);
	        // add properties
	        extendObservable(res, props);
	        return res;
	    },
	    shallowObject: function (props, name) {
	        if (arguments.length > 2)
	            { incorrectlyUsedAsDecorator("shallowObject"); }
	        var res = {};
	        asObservableObject(res, name);
	        extendShallowObservable(res, props);
	        return res;
	    },
	    ref: function () {
	        if (arguments.length < 2) {
	            // although ref creates actually a modifier descriptor, the type of the resultig properties
	            // of the object is `T` in the end, when the descriptors are interpreted
	            return createModifierDescriptor(referenceEnhancer, arguments[0]);
	        }
	        else {
	            return refDecorator.apply(null, arguments);
	        }
	    },
	    shallow: function () {
	        if (arguments.length < 2) {
	            // although ref creates actually a modifier descriptor, the type of the resultig properties
	            // of the object is `T` in the end, when the descriptors are interpreted
	            return createModifierDescriptor(shallowEnhancer, arguments[0]);
	        }
	        else {
	            return shallowDecorator.apply(null, arguments);
	        }
	    },
	    deep: function () {
	        if (arguments.length < 2) {
	            // although ref creates actually a modifier descriptor, the type of the resultig properties
	            // of the object is `T` in the end, when the descriptors are interpreted
	            return createModifierDescriptor(deepEnhancer, arguments[0]);
	        }
	        else {
	            return deepDecorator.apply(null, arguments);
	        }
	    },
	    struct: function () {
	        if (arguments.length < 2) {
	            // although ref creates actually a modifier descriptor, the type of the resultig properties
	            // of the object is `T` in the end, when the descriptors are interpreted
	            return createModifierDescriptor(deepStructEnhancer, arguments[0]);
	        }
	        else {
	            return deepStructDecorator.apply(null, arguments);
	        }
	    }
	};
	var observable = createObservable;
	// weird trick to keep our typings nicely with our funcs, and still extend the observable function
	Object.keys(observableFactories).forEach(function (name) { return (observable[name] = observableFactories[name]); });
	observable.deep.struct = observable.struct;
	observable.ref.struct = function () {
	    if (arguments.length < 2) {
	        return createModifierDescriptor(refStructEnhancer, arguments[0]);
	    }
	    else {
	        return refStructDecorator.apply(null, arguments);
	    }
	};
	function incorrectlyUsedAsDecorator(methodName) {
	    fail("Expected one or two arguments to observable." + methodName + ". Did you accidentally try to use observable." + methodName + " as decorator?");
	}

	function isModifierDescriptor(thing) {
	    return typeof thing === "object" && thing !== null && thing.isMobxModifierDescriptor === true;
	}
	function createModifierDescriptor(enhancer, initialValue) {
	    invariant(!isModifierDescriptor(initialValue), "Modifiers cannot be nested");
	    return {
	        isMobxModifierDescriptor: true,
	        initialValue: initialValue,
	        enhancer: enhancer
	    };
	}
	function deepEnhancer(v, _, name) {
	    if (isModifierDescriptor(v))
	        { fail("You tried to assign a modifier wrapped value to a collection, please define modifiers when creating the collection, not when modifying it"); }
	    // it is an observable already, done
	    if (isObservable(v))
	        { return v; }
	    // something that can be converted and mutated?
	    if (Array.isArray(v))
	        { return observable.array(v, name); }
	    if (isPlainObject(v))
	        { return observable.object(v, name); }
	    if (isES6Map(v))
	        { return observable.map(v, name); }
	    return v;
	}
	function shallowEnhancer(v, _, name) {
	    if (isModifierDescriptor(v))
	        { fail("You tried to assign a modifier wrapped value to a collection, please define modifiers when creating the collection, not when modifying it"); }
	    if (v === undefined || v === null)
	        { return v; }
	    if (isObservableObject(v) || isObservableArray(v) || isObservableMap(v))
	        { return v; }
	    if (Array.isArray(v))
	        { return observable.shallowArray(v, name); }
	    if (isPlainObject(v))
	        { return observable.shallowObject(v, name); }
	    if (isES6Map(v))
	        { return observable.shallowMap(v, name); }
	    return fail("The shallow modifier / decorator can only used in combination with arrays, objects and maps");
	}
	function referenceEnhancer(newValue) {
	    // never turn into an observable
	    return newValue;
	}
	function deepStructEnhancer(v, oldValue, name) {
	    // don't confuse structurally compare enhancer with ref enhancer! The latter is probably
	    // more suited for immutable objects
	    if (deepEqual(v, oldValue))
	        { return oldValue; }
	    // it is an observable already, done
	    if (isObservable(v))
	        { return v; }
	    // something that can be converted and mutated?
	    if (Array.isArray(v))
	        { return new ObservableArray(v, deepStructEnhancer, name); }
	    if (isES6Map(v))
	        { return new ObservableMap(v, deepStructEnhancer, name); }
	    if (isPlainObject(v)) {
	        var res = {};
	        asObservableObject(res, name);
	        extendObservableHelper(res, deepStructEnhancer, [v]);
	        return res;
	    }
	    return v;
	}
	function refStructEnhancer(v, oldValue, name) {
	    if (deepEqual(v, oldValue))
	        { return oldValue; }
	    return v;
	}

	/**
	 * During a transaction no views are updated until the end of the transaction.
	 * The transaction will be run synchronously nonetheless.
	 *
	 * @param action a function that updates some reactive state
	 * @returns any value that was returned by the 'action' parameter.
	 */
	function transaction(action, thisArg) {
	    if (thisArg === void 0) { thisArg = undefined; }
	    startBatch();
	    try {
	        return action.apply(thisArg);
	    }
	    finally {
	        endBatch();
	    }
	}

	var ObservableMapMarker = {};
	var ObservableMap = /** @class */ (function () {
	    function ObservableMap(initialData, enhancer, name) {
	        if (enhancer === void 0) { enhancer = deepEnhancer; }
	        if (name === void 0) { name = "ObservableMap@" + getNextId(); }
	        this.enhancer = enhancer;
	        this.name = name;
	        this.$mobx = ObservableMapMarker;
	        this._data = Object.create(null);
	        this._hasMap = Object.create(null); // hasMap, not hashMap >-).
	        this._keys = new ObservableArray(undefined, referenceEnhancer, this.name + ".keys()", true);
	        this.interceptors = null;
	        this.changeListeners = null;
	        this.dehancer = undefined;
	        this.merge(initialData);
	    }
	    ObservableMap.prototype._has = function (key) {
	        return typeof this._data[key] !== "undefined";
	    };
	    ObservableMap.prototype.has = function (key) {
	        if (!this.isValidKey(key))
	            { return false; }
	        key = "" + key;
	        if (this._hasMap[key])
	            { return this._hasMap[key].get(); }
	        return this._updateHasMapEntry(key, false).get();
	    };
	    ObservableMap.prototype.set = function (key, value) {
	        this.assertValidKey(key);
	        key = "" + key;
	        var hasKey = this._has(key);
	        if (hasInterceptors(this)) {
	            var change = interceptChange(this, {
	                type: hasKey ? "update" : "add",
	                object: this,
	                newValue: value,
	                name: key
	            });
	            if (!change)
	                { return this; }
	            value = change.newValue;
	        }
	        if (hasKey) {
	            this._updateValue(key, value);
	        }
	        else {
	            this._addValue(key, value);
	        }
	        return this;
	    };
	    ObservableMap.prototype.delete = function (key) {
	        var _this = this;
	        this.assertValidKey(key);
	        key = "" + key;
	        if (hasInterceptors(this)) {
	            var change = interceptChange(this, {
	                type: "delete",
	                object: this,
	                name: key
	            });
	            if (!change)
	                { return false; }
	        }
	        if (this._has(key)) {
	            var notifySpy = isSpyEnabled();
	            var notify = hasListeners(this);
	            var change = notify || notifySpy
	                ? {
	                    type: "delete",
	                    object: this,
	                    oldValue: this._data[key].value,
	                    name: key
	                }
	                : null;
	            if (notifySpy)
	                { spyReportStart(change); }
	            transaction(function () {
	                _this._keys.remove(key);
	                _this._updateHasMapEntry(key, false);
	                var observable$$1 = _this._data[key];
	                observable$$1.setNewValue(undefined);
	                _this._data[key] = undefined;
	            });
	            if (notify)
	                { notifyListeners(this, change); }
	            if (notifySpy)
	                { spyReportEnd(); }
	            return true;
	        }
	        return false;
	    };
	    ObservableMap.prototype._updateHasMapEntry = function (key, value) {
	        // optimization; don't fill the hasMap if we are not observing, or remove entry if there are no observers anymore
	        var entry = this._hasMap[key];
	        if (entry) {
	            entry.setNewValue(value);
	        }
	        else {
	            entry = this._hasMap[key] = new ObservableValue(value, referenceEnhancer, this.name + "." + key + "?", false);
	        }
	        return entry;
	    };
	    ObservableMap.prototype._updateValue = function (name, newValue) {
	        var observable$$1 = this._data[name];
	        newValue = observable$$1.prepareNewValue(newValue);
	        if (newValue !== UNCHANGED) {
	            var notifySpy = isSpyEnabled();
	            var notify = hasListeners(this);
	            var change = notify || notifySpy
	                ? {
	                    type: "update",
	                    object: this,
	                    oldValue: observable$$1.value,
	                    name: name,
	                    newValue: newValue
	                }
	                : null;
	            if (notifySpy)
	                { spyReportStart(change); }
	            observable$$1.setNewValue(newValue);
	            if (notify)
	                { notifyListeners(this, change); }
	            if (notifySpy)
	                { spyReportEnd(); }
	        }
	    };
	    ObservableMap.prototype._addValue = function (name, newValue) {
	        var _this = this;
	        transaction(function () {
	            var observable$$1 = (_this._data[name] = new ObservableValue(newValue, _this.enhancer, _this.name + "." + name, false));
	            newValue = observable$$1.value; // value might have been changed
	            _this._updateHasMapEntry(name, true);
	            _this._keys.push(name);
	        });
	        var notifySpy = isSpyEnabled();
	        var notify = hasListeners(this);
	        var change = notify || notifySpy
	            ? {
	                type: "add",
	                object: this,
	                name: name,
	                newValue: newValue
	            }
	            : null;
	        if (notifySpy)
	            { spyReportStart(change); }
	        if (notify)
	            { notifyListeners(this, change); }
	        if (notifySpy)
	            { spyReportEnd(); }
	    };
	    ObservableMap.prototype.get = function (key) {
	        key = "" + key;
	        if (this.has(key))
	            { return this.dehanceValue(this._data[key].get()); }
	        return this.dehanceValue(undefined);
	    };
	    ObservableMap.prototype.dehanceValue = function (value) {
	        if (this.dehancer !== undefined) {
	            return this.dehancer(value);
	        }
	        return value;
	    };
	    ObservableMap.prototype.keys = function () {
	        return arrayAsIterator(this._keys.slice());
	    };
	    ObservableMap.prototype.values = function () {
	        return arrayAsIterator(this._keys.map(this.get, this));
	    };
	    ObservableMap.prototype.entries = function () {
	        var _this = this;
	        return arrayAsIterator(this._keys.map(function (key) { return [key, _this.get(key)]; }));
	    };
	    ObservableMap.prototype.forEach = function (callback, thisArg) {
	        var _this = this;
	        this.keys().forEach(function (key) { return callback.call(thisArg, _this.get(key), key, _this); });
	    };
	    /** Merge another object into this object, returns this. */
	    ObservableMap.prototype.merge = function (other) {
	        var _this = this;
	        if (isObservableMap(other)) {
	            other = other.toJS();
	        }
	        transaction(function () {
	            if (isPlainObject(other))
	                { Object.keys(other).forEach(function (key) { return _this.set(key, other[key]); }); }
	            else if (Array.isArray(other))
	                { other.forEach(function (_a) {
	                    var key = _a[0], value = _a[1];
	                    return _this.set(key, value);
	                }); }
	            else if (isES6Map(other))
	                { other.forEach(function (value, key) { return _this.set(key, value); }); }
	            else if (other !== null && other !== undefined)
	                { fail("Cannot initialize map from " + other); }
	        });
	        return this;
	    };
	    ObservableMap.prototype.clear = function () {
	        var _this = this;
	        transaction(function () {
	            untracked(function () {
	                _this.keys().forEach(_this.delete, _this);
	            });
	        });
	    };
	    ObservableMap.prototype.replace = function (values) {
	        var _this = this;
	        transaction(function () {
	            // grab all the keys that are present in the new map but not present in the current map
	            // and delete them from the map, then merge the new map
	            // this will cause reactions only on changed values
	            var newKeys = getMapLikeKeys(values);
	            var oldKeys = _this.keys();
	            var missingKeys = oldKeys.filter(function (k) { return newKeys.indexOf(k) === -1; });
	            missingKeys.forEach(function (k) { return _this.delete(k); });
	            _this.merge(values);
	        });
	        return this;
	    };
	    Object.defineProperty(ObservableMap.prototype, "size", {
	        get: function () {
	            return this._keys.length;
	        },
	        enumerable: true,
	        configurable: true
	    });
	    /**
	     * Returns a shallow non observable object clone of this map.
	     * Note that the values might still be observable. For a deep clone use mobx.toJS.
	     */
	    ObservableMap.prototype.toJS = function () {
	        var _this = this;
	        var res = {};
	        this.keys().forEach(function (key) { return (res[key] = _this.get(key)); });
	        return res;
	    };
	    ObservableMap.prototype.toJSON = function () {
	        // Used by JSON.stringify
	        return this.toJS();
	    };
	    ObservableMap.prototype.isValidKey = function (key) {
	        if (key === null || key === undefined)
	            { return false; }
	        if (typeof key === "string" || typeof key === "number" || typeof key === "boolean")
	            { return true; }
	        return false;
	    };
	    ObservableMap.prototype.assertValidKey = function (key) {
	        if (!this.isValidKey(key))
	            { throw new Error("[mobx.map] Invalid key: '" + key + "', only strings, numbers and booleans are accepted as key in observable maps."); }
	    };
	    ObservableMap.prototype.toString = function () {
	        var _this = this;
	        return (this.name +
	            "[{ " +
	            this.keys().map(function (key) { return key + ": " + ("" + _this.get(key)); }).join(", ") +
	            " }]");
	    };
	    /**
	     * Observes this object. Triggers for the events 'add', 'update' and 'delete'.
	     * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/observe
	     * for callback details
	     */
	    ObservableMap.prototype.observe = function (listener, fireImmediately) {
	        invariant(fireImmediately !== true, getMessage("m033"));
	        return registerListener(this, listener);
	    };
	    ObservableMap.prototype.intercept = function (handler) {
	        return registerInterceptor(this, handler);
	    };
	    return ObservableMap;
	}());
	declareIterator(ObservableMap.prototype, function () {
	    return this.entries();
	});
	function map(initialValues) {
	    deprecated("`mobx.map` is deprecated, use `new ObservableMap` or `mobx.observable.map` instead");
	    return observable.map(initialValues);
	}
	/* 'var' fixes small-build issue */
	var isObservableMap = createInstanceofPredicate("ObservableMap", ObservableMap);

	var EMPTY_ARRAY = [];
	Object.freeze(EMPTY_ARRAY);
	function getGlobal() {
	    return typeof window !== "undefined" ? window : global;
	}
	function getNextId() {
	    return ++globalState.mobxGuid;
	}
	function fail(message, thing) {
	    invariant(false, message, thing);
	    throw "X"; // unreachable
	}
	function invariant(check, message, thing) {
	    if (!check)
	        { throw new Error("[mobx] Invariant failed: " + message + (thing ? " in '" + thing + "'" : "")); }
	}
	/**
	 * Prints a deprecation message, but only one time.
	 * Returns false if the deprecated message was already printed before
	 */
	var deprecatedMessages = [];
	function deprecated(msg) {
	    if (deprecatedMessages.indexOf(msg) !== -1)
	        { return false; }
	    deprecatedMessages.push(msg);
	    console.error("[mobx] Deprecated: " + msg);
	    return true;
	}
	/**
	 * Makes sure that the provided function is invoked at most once.
	 */
	function once(func) {
	    var invoked = false;
	    return function () {
	        if (invoked)
	            { return; }
	        invoked = true;
	        return func.apply(this, arguments);
	    };
	}
	var noop = function () { };
	function unique(list) {
	    var res = [];
	    list.forEach(function (item) {
	        if (res.indexOf(item) === -1)
	            { res.push(item); }
	    });
	    return res;
	}
	function joinStrings(things, limit, separator) {
	    if (limit === void 0) { limit = 100; }
	    if (separator === void 0) { separator = " - "; }
	    if (!things)
	        { return ""; }
	    var sliced = things.slice(0, limit);
	    return "" + sliced.join(separator) + (things.length > limit
	        ? " (... and " + (things.length - limit) + "more)"
	        : "");
	}
	function isObject(value) {
	    return value !== null && typeof value === "object";
	}
	function isPlainObject(value) {
	    if (value === null || typeof value !== "object")
	        { return false; }
	    var proto = Object.getPrototypeOf(value);
	    return proto === Object.prototype || proto === null;
	}
	function objectAssign() {
	    var arguments$1 = arguments;

	    var res = arguments[0];
	    for (var i = 1, l = arguments.length; i < l; i++) {
	        var source = arguments$1[i];
	        for (var key in source)
	            { if (hasOwnProperty(source, key)) {
	                res[key] = source[key];
	            } }
	    }
	    return res;
	}
	var prototypeHasOwnProperty = Object.prototype.hasOwnProperty;
	function hasOwnProperty(object, propName) {
	    return prototypeHasOwnProperty.call(object, propName);
	}
	function makeNonEnumerable(object, propNames) {
	    for (var i = 0; i < propNames.length; i++) {
	        addHiddenProp(object, propNames[i], object[propNames[i]]);
	    }
	}
	function addHiddenProp(object, propName, value) {
	    Object.defineProperty(object, propName, {
	        enumerable: false,
	        writable: true,
	        configurable: true,
	        value: value
	    });
	}
	function addHiddenFinalProp(object, propName, value) {
	    Object.defineProperty(object, propName, {
	        enumerable: false,
	        writable: false,
	        configurable: true,
	        value: value
	    });
	}
	function isPropertyConfigurable(object, prop) {
	    var descriptor = Object.getOwnPropertyDescriptor(object, prop);
	    return !descriptor || (descriptor.configurable !== false && descriptor.writable !== false);
	}
	function assertPropertyConfigurable(object, prop) {
	    invariant(isPropertyConfigurable(object, prop), "Cannot make property '" + prop + "' observable, it is not configurable and writable in the target object");
	}
	function createInstanceofPredicate(name, clazz) {
	    var propName = "isMobX" + name;
	    clazz.prototype[propName] = true;
	    return function (x) {
	        return isObject(x) && x[propName] === true;
	    };
	}
	function areBothNaN(a, b) {
	    return typeof a === "number" && typeof b === "number" && isNaN(a) && isNaN(b);
	}
	/**
	 * Returns whether the argument is an array, disregarding observability.
	 */
	function isArrayLike(x) {
	    return Array.isArray(x) || isObservableArray(x);
	}
	function isES6Map(thing) {
	    if (getGlobal().Map !== undefined && thing instanceof getGlobal().Map)
	        { return true; }
	    return false;
	}
	function getMapLikeKeys(map$$1) {
	    if (isPlainObject(map$$1))
	        { return Object.keys(map$$1); }
	    if (Array.isArray(map$$1))
	        { return map$$1.map(function (_a) {
	            var key = _a[0];
	            return key;
	        }); }
	    if (isES6Map(map$$1))
	        { return Array.from(map$$1.keys()); }
	    if (isObservableMap(map$$1))
	        { return map$$1.keys(); }
	    return fail("Cannot get keys from " + map$$1);
	}
	function iteratorToArray(it) {
	    var res = [];
	    while (true) {
	        var r = it.next();
	        if (r.done)
	            { break; }
	        res.push(r.value);
	    }
	    return res;
	}
	function primitiveSymbol() {
	    return (typeof Symbol === "function" && Symbol.toPrimitive) || "@@toPrimitive";
	}
	function toPrimitive(value) {
	    return value === null ? null : typeof value === "object" ? "" + value : value;
	}

	/**
	 * These values will persist if global state is reset
	 */
	var persistentKeys = ["mobxGuid", "resetId", "spyListeners", "strictMode", "runId"];
	var MobXGlobals = /** @class */ (function () {
	    function MobXGlobals() {
	        /**
	         * MobXGlobals version.
	         * MobX compatiblity with other versions loaded in memory as long as this version matches.
	         * It indicates that the global state still stores similar information
	         */
	        this.version = 5;
	        /**
	         * Currently running derivation
	         */
	        this.trackingDerivation = null;
	        /**
	         * Are we running a computation currently? (not a reaction)
	         */
	        this.computationDepth = 0;
	        /**
	         * Each time a derivation is tracked, it is assigned a unique run-id
	         */
	        this.runId = 0;
	        /**
	         * 'guid' for general purpose. Will be persisted amongst resets.
	         */
	        this.mobxGuid = 0;
	        /**
	         * Are we in a batch block? (and how many of them)
	         */
	        this.inBatch = 0;
	        /**
	         * Observables that don't have observers anymore, and are about to be
	         * suspended, unless somebody else accesses it in the same batch
	         *
	         * @type {IObservable[]}
	         */
	        this.pendingUnobservations = [];
	        /**
	         * List of scheduled, not yet executed, reactions.
	         */
	        this.pendingReactions = [];
	        /**
	         * Are we currently processing reactions?
	         */
	        this.isRunningReactions = false;
	        /**
	         * Is it allowed to change observables at this point?
	         * In general, MobX doesn't allow that when running computations and React.render.
	         * To ensure that those functions stay pure.
	         */
	        this.allowStateChanges = true;
	        /**
	         * If strict mode is enabled, state changes are by default not allowed
	         */
	        this.strictMode = false;
	        /**
	         * Used by createTransformer to detect that the global state has been reset.
	         */
	        this.resetId = 0;
	        /**
	         * Spy callbacks
	         */
	        this.spyListeners = [];
	        /**
	         * Globally attached error handlers that react specifically to errors in reactions
	         */
	        this.globalReactionErrorHandlers = [];
	    }
	    return MobXGlobals;
	}());
	var globalState = new MobXGlobals();
	var shareGlobalStateCalled = false;
	var runInIsolationCalled = false;
	var warnedAboutMultipleInstances = false;
	{
	    var global_1 = getGlobal();
	    if (!global_1.__mobxInstanceCount) {
	        global_1.__mobxInstanceCount = 1;
	    }
	    else {
	        global_1.__mobxInstanceCount++;
	        setTimeout(function () {
	            if (!shareGlobalStateCalled && !runInIsolationCalled && !warnedAboutMultipleInstances) {
	                warnedAboutMultipleInstances = true;
	                console.warn("[mobx] Warning: there are multiple mobx instances active. This might lead to unexpected results. See https://github.com/mobxjs/mobx/issues/1082 for details.");
	            }
	        }, 1);
	    }
	}
	function isolateGlobalState() {
	    runInIsolationCalled = true;
	    getGlobal().__mobxInstanceCount--;
	}
	function shareGlobalState() {
	    // TODO: remove in 4.0; just use peer dependencies instead.
	    deprecated("Using `shareGlobalState` is not recommended, use peer dependencies instead. See https://github.com/mobxjs/mobx/issues/1082 for details.");
	    shareGlobalStateCalled = true;
	    var global = getGlobal();
	    var ownState = globalState;
	    /**
	     * Backward compatibility check
	     */
	    if (global.__mobservableTrackingStack || global.__mobservableViewStack)
	        { throw new Error("[mobx] An incompatible version of mobservable is already loaded."); }
	    if (global.__mobxGlobal && global.__mobxGlobal.version !== ownState.version)
	        { throw new Error("[mobx] An incompatible version of mobx is already loaded."); }
	    if (global.__mobxGlobal)
	        { globalState = global.__mobxGlobal; }
	    else
	        { global.__mobxGlobal = ownState; }
	}
	function getGlobalState() {
	    return globalState;
	}

	/**
	 * For testing purposes only; this will break the internal state of existing observables,
	 * but can be used to get back at a stable state after throwing errors
	 */
	function resetGlobalState() {
	    globalState.resetId++;
	    var defaultGlobals = new MobXGlobals();
	    for (var key in defaultGlobals)
	        { if (persistentKeys.indexOf(key) === -1)
	            { globalState[key] = defaultGlobals[key]; } }
	    globalState.allowStateChanges = !globalState.strictMode;
	}

	function getAtom(thing, property) {
	    if (typeof thing === "object" && thing !== null) {
	        if (isObservableArray(thing)) {
	            invariant(property === undefined, getMessage("m036"));
	            return thing.$mobx.atom;
	        }
	        if (isObservableMap(thing)) {
	            var anyThing = thing;
	            if (property === undefined)
	                { return getAtom(anyThing._keys); }
	            var observable = anyThing._data[property] || anyThing._hasMap[property];
	            invariant(!!observable, "the entry '" + property + "' does not exist in the observable map '" + getDebugName(thing) + "'");
	            return observable;
	        }
	        // Initializers run lazily when transpiling to babel, so make sure they are run...
	        runLazyInitializers(thing);
	        if (property && !thing.$mobx)
	            { thing[property]; } // See #1072 // TODO: remove in 4.0
	        if (isObservableObject(thing)) {
	            if (!property)
	                { return fail("please specify a property"); }
	            var observable = thing.$mobx.values[property];
	            invariant(!!observable, "no observable property '" + property + "' found on the observable object '" + getDebugName(thing) + "'");
	            return observable;
	        }
	        if (isAtom(thing) || isComputedValue(thing) || isReaction(thing)) {
	            return thing;
	        }
	    }
	    else if (typeof thing === "function") {
	        if (isReaction(thing.$mobx)) {
	            // disposer function
	            return thing.$mobx;
	        }
	    }
	    return fail("Cannot obtain atom from " + thing);
	}
	function getAdministration(thing, property) {
	    invariant(thing, "Expecting some object");
	    if (property !== undefined)
	        { return getAdministration(getAtom(thing, property)); }
	    if (isAtom(thing) || isComputedValue(thing) || isReaction(thing))
	        { return thing; }
	    if (isObservableMap(thing))
	        { return thing; }
	    // Initializers run lazily when transpiling to babel, so make sure they are run...
	    runLazyInitializers(thing);
	    if (thing.$mobx)
	        { return thing.$mobx; }
	    invariant(false, "Cannot obtain administration from " + thing);
	}
	function getDebugName(thing, property) {
	    var named;
	    if (property !== undefined)
	        { named = getAtom(thing, property); }
	    else if (isObservableObject(thing) || isObservableMap(thing))
	        { named = getAdministration(thing); }
	    else
	        { named = getAtom(thing); } // valid for arrays as well
	    return named.name;
	}

	function getDependencyTree(thing, property) {
	    return nodeToDependencyTree(getAtom(thing, property));
	}
	function nodeToDependencyTree(node) {
	    var result = {
	        name: node.name
	    };
	    if (node.observing && node.observing.length > 0)
	        { result.dependencies = unique(node.observing).map(nodeToDependencyTree); }
	    return result;
	}
	function getObserverTree(thing, property) {
	    return nodeToObserverTree(getAtom(thing, property));
	}
	function nodeToObserverTree(node) {
	    var result = {
	        name: node.name
	    };
	    if (hasObservers(node))
	        { result.observers = getObservers(node).map(nodeToObserverTree); }
	    return result;
	}

	function hasObservers(observable) {
	    return observable.observers && observable.observers.length > 0;
	}
	function getObservers(observable) {
	    return observable.observers;
	}
	function addObserver(observable, node) {
	    // invariant(node.dependenciesState !== -1, "INTERNAL ERROR, can add only dependenciesState !== -1");
	    // invariant(observable._observers.indexOf(node) === -1, "INTERNAL ERROR add already added node");
	    // invariantObservers(observable);
	    var l = observable.observers.length;
	    if (l) {
	        // because object assignment is relatively expensive, let's not store data about index 0.
	        observable.observersIndexes[node.__mapid] = l;
	    }
	    observable.observers[l] = node;
	    if (observable.lowestObserverState > node.dependenciesState)
	        { observable.lowestObserverState = node.dependenciesState; }
	    // invariantObservers(observable);
	    // invariant(observable._observers.indexOf(node) !== -1, "INTERNAL ERROR didn't add node");
	}
	function removeObserver(observable, node) {
	    // invariant(globalState.inBatch > 0, "INTERNAL ERROR, remove should be called only inside batch");
	    // invariant(observable._observers.indexOf(node) !== -1, "INTERNAL ERROR remove already removed node");
	    // invariantObservers(observable);
	    if (observable.observers.length === 1) {
	        // deleting last observer
	        observable.observers.length = 0;
	        queueForUnobservation(observable);
	    }
	    else {
	        // deleting from _observersIndexes is straight forward, to delete from _observers, let's swap `node` with last element
	        var list = observable.observers;
	        var map = observable.observersIndexes;
	        var filler = list.pop(); // get last element, which should fill the place of `node`, so the array doesn't have holes
	        if (filler !== node) {
	            // otherwise node was the last element, which already got removed from array
	            var index = map[node.__mapid] || 0; // getting index of `node`. this is the only place we actually use map.
	            if (index) {
	                // map store all indexes but 0, see comment in `addObserver`
	                map[filler.__mapid] = index;
	            }
	            else {
	                delete map[filler.__mapid];
	            }
	            list[index] = filler;
	        }
	        delete map[node.__mapid];
	    }
	    // invariantObservers(observable);
	    // invariant(observable._observers.indexOf(node) === -1, "INTERNAL ERROR remove already removed node2");
	}
	function queueForUnobservation(observable) {
	    if (!observable.isPendingUnobservation) {
	        // invariant(globalState.inBatch > 0, "INTERNAL ERROR, remove should be called only inside batch");
	        // invariant(observable._observers.length === 0, "INTERNAL ERROR, should only queue for unobservation unobserved observables");
	        observable.isPendingUnobservation = true;
	        globalState.pendingUnobservations.push(observable);
	    }
	}
	/**
	 * Batch starts a transaction, at least for purposes of memoizing ComputedValues when nothing else does.
	 * During a batch `onBecomeUnobserved` will be called at most once per observable.
	 * Avoids unnecessary recalculations.
	 */
	function startBatch() {
	    globalState.inBatch++;
	}
	function endBatch() {
	    if (--globalState.inBatch === 0) {
	        runReactions();
	        // the batch is actually about to finish, all unobserving should happen here.
	        var list = globalState.pendingUnobservations;
	        for (var i = 0; i < list.length; i++) {
	            var observable = list[i];
	            observable.isPendingUnobservation = false;
	            if (observable.observers.length === 0) {
	                observable.onBecomeUnobserved();
	                // NOTE: onBecomeUnobserved might push to `pendingUnobservations`
	            }
	        }
	        globalState.pendingUnobservations = [];
	    }
	}
	function reportObserved(observable) {
	    var derivation = globalState.trackingDerivation;
	    if (derivation !== null) {
	        /**
	         * Simple optimization, give each derivation run an unique id (runId)
	         * Check if last time this observable was accessed the same runId is used
	         * if this is the case, the relation is already known
	         */
	        if (derivation.runId !== observable.lastAccessedBy) {
	            observable.lastAccessedBy = derivation.runId;
	            derivation.newObserving[derivation.unboundDepsCount++] = observable;
	        }
	    }
	    else if (observable.observers.length === 0) {
	        queueForUnobservation(observable);
	    }
	}
	/**
	 * NOTE: current propagation mechanism will in case of self reruning autoruns behave unexpectedly
	 * It will propagate changes to observers from previous run
	 * It's hard or maybe impossible (with reasonable perf) to get it right with current approach
	 * Hopefully self reruning autoruns aren't a feature people should depend on
	 * Also most basic use cases should be ok
	 */
	// Called by Atom when its value changes
	function propagateChanged(observable) {
	    // invariantLOS(observable, "changed start");
	    if (observable.lowestObserverState === IDerivationState.STALE)
	        { return; }
	    observable.lowestObserverState = IDerivationState.STALE;
	    var observers = observable.observers;
	    var i = observers.length;
	    while (i--) {
	        var d = observers[i];
	        if (d.dependenciesState === IDerivationState.UP_TO_DATE) {
	            if (d.isTracing !== TraceMode.NONE) {
	                logTraceInfo(d, observable);
	            }
	            d.onBecomeStale();
	        }
	        d.dependenciesState = IDerivationState.STALE;
	    }
	    // invariantLOS(observable, "changed end");
	}
	// Called by ComputedValue when it recalculate and its value changed
	function propagateChangeConfirmed(observable) {
	    // invariantLOS(observable, "confirmed start");
	    if (observable.lowestObserverState === IDerivationState.STALE)
	        { return; }
	    observable.lowestObserverState = IDerivationState.STALE;
	    var observers = observable.observers;
	    var i = observers.length;
	    while (i--) {
	        var d = observers[i];
	        if (d.dependenciesState === IDerivationState.POSSIBLY_STALE)
	            { d.dependenciesState = IDerivationState.STALE; }
	        else if (d.dependenciesState === IDerivationState.UP_TO_DATE // this happens during computing of `d`, just keep lowestObserverState up to date.
	        )
	            { observable.lowestObserverState = IDerivationState.UP_TO_DATE; }
	    }
	    // invariantLOS(observable, "confirmed end");
	}
	// Used by computed when its dependency changed, but we don't wan't to immediately recompute.
	function propagateMaybeChanged(observable) {
	    // invariantLOS(observable, "maybe start");
	    if (observable.lowestObserverState !== IDerivationState.UP_TO_DATE)
	        { return; }
	    observable.lowestObserverState = IDerivationState.POSSIBLY_STALE;
	    var observers = observable.observers;
	    var i = observers.length;
	    while (i--) {
	        var d = observers[i];
	        if (d.dependenciesState === IDerivationState.UP_TO_DATE) {
	            d.dependenciesState = IDerivationState.POSSIBLY_STALE;
	            if (d.isTracing !== TraceMode.NONE) {
	                logTraceInfo(d, observable);
	            }
	            d.onBecomeStale();
	        }
	    }
	    // invariantLOS(observable, "maybe end");
	}
	function logTraceInfo(derivation, observable) {
	    console.log("[mobx.trace] '" + derivation.name + "' is invalidated due to a change in: '" + observable.name + "'");
	    if (derivation.isTracing === TraceMode.BREAK) {
	        var lines = [];
	        printDepTree(getDependencyTree(derivation), lines, 1);
	        // prettier-ignore
	        new Function("debugger;\n/*\nTracing '" + derivation.name + "'\n\nYou are entering this break point because derivation '" + derivation.name + "' is being traced and '" + observable.name + "' is now forcing it to update.\nJust follow the stacktrace you should now see in the devtools to see precisely what piece of your code is causing this update\nThe stackframe you are looking for is at least ~6-8 stack-frames up.\n\n" + (derivation instanceof ComputedValue ? derivation.derivation.toString() : "") + "\n\nThe dependencies for this derivation are:\n\n" + lines.join("\n") + "\n*/\n    ")();
	    }
	}
	function printDepTree(tree, lines, depth) {
	    if (lines.length >= 1000) {
	        lines.push("(and many more)");
	        return;
	    }
	    lines.push("" + new Array(depth).join("\t") + tree.name); // MWE: not the fastest, but the easiest way :)
	    if (tree.dependencies)
	        { tree.dependencies.forEach(function (child) { return printDepTree(child, lines, depth + 1); }); }
	}

	var IDerivationState;
	(function (IDerivationState) {
	    // before being run or (outside batch and not being observed)
	    // at this point derivation is not holding any data about dependency tree
	    IDerivationState[IDerivationState["NOT_TRACKING"] = -1] = "NOT_TRACKING";
	    // no shallow dependency changed since last computation
	    // won't recalculate derivation
	    // this is what makes mobx fast
	    IDerivationState[IDerivationState["UP_TO_DATE"] = 0] = "UP_TO_DATE";
	    // some deep dependency changed, but don't know if shallow dependency changed
	    // will require to check first if UP_TO_DATE or POSSIBLY_STALE
	    // currently only ComputedValue will propagate POSSIBLY_STALE
	    //
	    // having this state is second big optimization:
	    // don't have to recompute on every dependency change, but only when it's needed
	    IDerivationState[IDerivationState["POSSIBLY_STALE"] = 1] = "POSSIBLY_STALE";
	    // A shallow dependency has changed since last computation and the derivation
	    // will need to recompute when it's needed next.
	    IDerivationState[IDerivationState["STALE"] = 2] = "STALE";
	})(IDerivationState || (IDerivationState = {}));
	var TraceMode;
	(function (TraceMode) {
	    TraceMode[TraceMode["NONE"] = 0] = "NONE";
	    TraceMode[TraceMode["LOG"] = 1] = "LOG";
	    TraceMode[TraceMode["BREAK"] = 2] = "BREAK";
	})(TraceMode || (TraceMode = {}));
	var CaughtException = /** @class */ (function () {
	    function CaughtException(cause) {
	        this.cause = cause;
	        // Empty
	    }
	    return CaughtException;
	}());
	function isCaughtException(e) {
	    return e instanceof CaughtException;
	}
	/**
	 * Finds out whether any dependency of the derivation has actually changed.
	 * If dependenciesState is 1 then it will recalculate dependencies,
	 * if any dependency changed it will propagate it by changing dependenciesState to 2.
	 *
	 * By iterating over the dependencies in the same order that they were reported and
	 * stopping on the first change, all the recalculations are only called for ComputedValues
	 * that will be tracked by derivation. That is because we assume that if the first x
	 * dependencies of the derivation doesn't change then the derivation should run the same way
	 * up until accessing x-th dependency.
	 */
	function shouldCompute(derivation) {
	    switch (derivation.dependenciesState) {
	        case IDerivationState.UP_TO_DATE:
	            return false;
	        case IDerivationState.NOT_TRACKING:
	        case IDerivationState.STALE:
	            return true;
	        case IDerivationState.POSSIBLY_STALE: {
	            var prevUntracked = untrackedStart(); // no need for those computeds to be reported, they will be picked up in trackDerivedFunction.
	            var obs = derivation.observing, l = obs.length;
	            for (var i = 0; i < l; i++) {
	                var obj = obs[i];
	                if (isComputedValue(obj)) {
	                    try {
	                        obj.get();
	                    }
	                    catch (e) {
	                        // we are not interested in the value *or* exception at this moment, but if there is one, notify all
	                        untrackedEnd(prevUntracked);
	                        return true;
	                    }
	                    // if ComputedValue `obj` actually changed it will be computed and propagated to its observers.
	                    // and `derivation` is an observer of `obj`
	                    if (derivation.dependenciesState === IDerivationState.STALE) {
	                        untrackedEnd(prevUntracked);
	                        return true;
	                    }
	                }
	            }
	            changeDependenciesStateTo0(derivation);
	            untrackedEnd(prevUntracked);
	            return false;
	        }
	    }
	}
	function isComputingDerivation() {
	    return globalState.trackingDerivation !== null; // filter out actions inside computations
	}
	function checkIfStateModificationsAreAllowed(atom) {
	    var hasObservers$$1 = atom.observers.length > 0;
	    // Should never be possible to change an observed observable from inside computed, see #798
	    if (globalState.computationDepth > 0 && hasObservers$$1)
	        { fail(getMessage("m031") + atom.name); }
	    // Should not be possible to change observed state outside strict mode, except during initialization, see #563
	    if (!globalState.allowStateChanges && hasObservers$$1)
	        { fail(getMessage(globalState.strictMode ? "m030a" : "m030b") + atom.name); }
	}
	/**
	 * Executes the provided function `f` and tracks which observables are being accessed.
	 * The tracking information is stored on the `derivation` object and the derivation is registered
	 * as observer of any of the accessed observables.
	 */
	function trackDerivedFunction(derivation, f, context) {
	    // pre allocate array allocation + room for variation in deps
	    // array will be trimmed by bindDependencies
	    changeDependenciesStateTo0(derivation);
	    derivation.newObserving = new Array(derivation.observing.length + 100);
	    derivation.unboundDepsCount = 0;
	    derivation.runId = ++globalState.runId;
	    var prevTracking = globalState.trackingDerivation;
	    globalState.trackingDerivation = derivation;
	    var result;
	    try {
	        result = f.call(context);
	    }
	    catch (e) {
	        result = new CaughtException(e);
	    }
	    globalState.trackingDerivation = prevTracking;
	    bindDependencies(derivation);
	    return result;
	}
	/**
	 * diffs newObserving with observing.
	 * update observing to be newObserving with unique observables
	 * notify observers that become observed/unobserved
	 */
	function bindDependencies(derivation) {
	    // invariant(derivation.dependenciesState !== IDerivationState.NOT_TRACKING, "INTERNAL ERROR bindDependencies expects derivation.dependenciesState !== -1");
	    var prevObserving = derivation.observing;
	    var observing = (derivation.observing = derivation.newObserving);
	    var lowestNewObservingDerivationState = IDerivationState.UP_TO_DATE;
	    // Go through all new observables and check diffValue: (this list can contain duplicates):
	    //   0: first occurrence, change to 1 and keep it
	    //   1: extra occurrence, drop it
	    var i0 = 0, l = derivation.unboundDepsCount;
	    for (var i = 0; i < l; i++) {
	        var dep = observing[i];
	        if (dep.diffValue === 0) {
	            dep.diffValue = 1;
	            if (i0 !== i)
	                { observing[i0] = dep; }
	            i0++;
	        }
	        // Upcast is 'safe' here, because if dep is IObservable, `dependenciesState` will be undefined,
	        // not hitting the condition
	        if (dep.dependenciesState > lowestNewObservingDerivationState) {
	            lowestNewObservingDerivationState = dep.dependenciesState;
	        }
	    }
	    observing.length = i0;
	    derivation.newObserving = null; // newObserving shouldn't be needed outside tracking (statement moved down to work around FF bug, see #614)
	    // Go through all old observables and check diffValue: (it is unique after last bindDependencies)
	    //   0: it's not in new observables, unobserve it
	    //   1: it keeps being observed, don't want to notify it. change to 0
	    l = prevObserving.length;
	    while (l--) {
	        var dep = prevObserving[l];
	        if (dep.diffValue === 0) {
	            removeObserver(dep, derivation);
	        }
	        dep.diffValue = 0;
	    }
	    // Go through all new observables and check diffValue: (now it should be unique)
	    //   0: it was set to 0 in last loop. don't need to do anything.
	    //   1: it wasn't observed, let's observe it. set back to 0
	    while (i0--) {
	        var dep = observing[i0];
	        if (dep.diffValue === 1) {
	            dep.diffValue = 0;
	            addObserver(dep, derivation);
	        }
	    }
	    // Some new observed derivations may become stale during this derivation computation
	    // so they have had no chance to propagate staleness (#916)
	    if (lowestNewObservingDerivationState !== IDerivationState.UP_TO_DATE) {
	        derivation.dependenciesState = lowestNewObservingDerivationState;
	        derivation.onBecomeStale();
	    }
	}
	function clearObserving(derivation) {
	    // invariant(globalState.inBatch > 0, "INTERNAL ERROR clearObserving should be called only inside batch");
	    var obs = derivation.observing;
	    derivation.observing = [];
	    var i = obs.length;
	    while (i--)
	        { removeObserver(obs[i], derivation); }
	    derivation.dependenciesState = IDerivationState.NOT_TRACKING;
	}
	function untracked(action) {
	    var prev = untrackedStart();
	    var res = action();
	    untrackedEnd(prev);
	    return res;
	}
	function untrackedStart() {
	    var prev = globalState.trackingDerivation;
	    globalState.trackingDerivation = null;
	    return prev;
	}
	function untrackedEnd(prev) {
	    globalState.trackingDerivation = prev;
	}
	/**
	 * needed to keep `lowestObserverState` correct. when changing from (2 or 1) to 0
	 *
	 */
	function changeDependenciesStateTo0(derivation) {
	    if (derivation.dependenciesState === IDerivationState.UP_TO_DATE)
	        { return; }
	    derivation.dependenciesState = IDerivationState.UP_TO_DATE;
	    var obs = derivation.observing;
	    var i = obs.length;
	    while (i--)
	        { obs[i].lowestObserverState = IDerivationState.UP_TO_DATE; }
	}

	function log(msg) {
	    console.log(msg);
	    return msg;
	}
	function whyRun(thing, prop) {
	    deprecated("`whyRun` is deprecated in favor of `trace`");
	    thing = getAtomFromArgs(arguments);
	    if (!thing)
	        { return log(getMessage("m024")); }
	    if (isComputedValue(thing) || isReaction(thing))
	        { return log(thing.whyRun()); }
	    return fail(getMessage("m025"));
	}
	function trace() {
	    var arguments$1 = arguments;

	    var args = [];
	    for (var _i = 0; _i < arguments.length; _i++) {
	        args[_i] = arguments$1[_i];
	    }
	    var enterBreakPoint = false;
	    if (typeof args[args.length - 1] === "boolean")
	        { enterBreakPoint = args.pop(); }
	    var derivation = getAtomFromArgs(args);
	    if (!derivation) {
	        return fail("'trace(break?)' can only be used inside a tracked computed value or a Reaction. Consider passing in the computed value or reaction explicitly");
	    }
	    if (derivation.isTracing === TraceMode.NONE) {
	        console.log("[mobx.trace] '" + derivation.name + "' tracing enabled");
	    }
	    derivation.isTracing = enterBreakPoint ? TraceMode.BREAK : TraceMode.LOG;
	}
	function getAtomFromArgs(args) {
	    switch (args.length) {
	        case 0:
	            return globalState.trackingDerivation;
	        case 1:
	            return getAtom(args[0]);
	        case 2:
	            return getAtom(args[0], args[1]);
	    }
	}

	var Reaction = /** @class */ (function () {
	    function Reaction(name, onInvalidate) {
	        if (name === void 0) { name = "Reaction@" + getNextId(); }
	        this.name = name;
	        this.onInvalidate = onInvalidate;
	        this.observing = []; // nodes we are looking at. Our value depends on these nodes
	        this.newObserving = [];
	        this.dependenciesState = IDerivationState.NOT_TRACKING;
	        this.diffValue = 0;
	        this.runId = 0;
	        this.unboundDepsCount = 0;
	        this.__mapid = "#" + getNextId();
	        this.isDisposed = false;
	        this._isScheduled = false;
	        this._isTrackPending = false;
	        this._isRunning = false;
	        this.isTracing = TraceMode.NONE;
	    }
	    Reaction.prototype.onBecomeStale = function () {
	        this.schedule();
	    };
	    Reaction.prototype.schedule = function () {
	        if (!this._isScheduled) {
	            this._isScheduled = true;
	            globalState.pendingReactions.push(this);
	            runReactions();
	        }
	    };
	    Reaction.prototype.isScheduled = function () {
	        return this._isScheduled;
	    };
	    /**
	     * internal, use schedule() if you intend to kick off a reaction
	     */
	    Reaction.prototype.runReaction = function () {
	        if (!this.isDisposed) {
	            startBatch();
	            this._isScheduled = false;
	            if (shouldCompute(this)) {
	                this._isTrackPending = true;
	                this.onInvalidate();
	                if (this._isTrackPending && isSpyEnabled()) {
	                    // onInvalidate didn't trigger track right away..
	                    spyReport({
	                        object: this,
	                        type: "scheduled-reaction"
	                    });
	                }
	            }
	            endBatch();
	        }
	    };
	    Reaction.prototype.track = function (fn) {
	        startBatch();
	        var notify = isSpyEnabled();
	        var startTime;
	        if (notify) {
	            startTime = Date.now();
	            spyReportStart({
	                object: this,
	                type: "reaction",
	                fn: fn
	            });
	        }
	        this._isRunning = true;
	        var result = trackDerivedFunction(this, fn, undefined);
	        this._isRunning = false;
	        this._isTrackPending = false;
	        if (this.isDisposed) {
	            // disposed during last run. Clean up everything that was bound after the dispose call.
	            clearObserving(this);
	        }
	        if (isCaughtException(result))
	            { this.reportExceptionInDerivation(result.cause); }
	        if (notify) {
	            spyReportEnd({
	                time: Date.now() - startTime
	            });
	        }
	        endBatch();
	    };
	    Reaction.prototype.reportExceptionInDerivation = function (error) {
	        var _this = this;
	        if (this.errorHandler) {
	            this.errorHandler(error, this);
	            return;
	        }
	        var message = "[mobx] Encountered an uncaught exception that was thrown by a reaction or observer component, in: '" + this;
	        var messageToUser = getMessage("m037");
	        console.error(message || messageToUser /* latter will not be true, make sure uglify doesn't remove */, error);
	        /** If debugging brought you here, please, read the above message :-). Tnx! */
	        if (isSpyEnabled()) {
	            spyReport({
	                type: "error",
	                message: message,
	                error: error,
	                object: this
	            });
	        }
	        globalState.globalReactionErrorHandlers.forEach(function (f) { return f(error, _this); });
	    };
	    Reaction.prototype.dispose = function () {
	        if (!this.isDisposed) {
	            this.isDisposed = true;
	            if (!this._isRunning) {
	                // if disposed while running, clean up later. Maybe not optimal, but rare case
	                startBatch();
	                clearObserving(this);
	                endBatch();
	            }
	        }
	    };
	    Reaction.prototype.getDisposer = function () {
	        var r = this.dispose.bind(this);
	        r.$mobx = this;
	        r.onError = registerErrorHandler;
	        return r;
	    };
	    Reaction.prototype.toString = function () {
	        return "Reaction[" + this.name + "]";
	    };
	    Reaction.prototype.whyRun = function () {
	        var observing = unique(this._isRunning ? this.newObserving : this.observing).map(function (dep) { return dep.name; });
	        return "\nWhyRun? reaction '" + this.name + "':\n * Status: [" + (this.isDisposed
	            ? "stopped"
	            : this._isRunning ? "running" : this.isScheduled() ? "scheduled" : "idle") + "]\n * This reaction will re-run if any of the following observables changes:\n    " + joinStrings(observing) + "\n    " + (this._isRunning
	            ? " (... or any observable accessed during the remainder of the current run)"
	            : "") + "\n\t" + getMessage("m038") + "\n";
	    };
	    Reaction.prototype.trace = function (enterBreakPoint) {
	        if (enterBreakPoint === void 0) { enterBreakPoint = false; }
	        trace(this, enterBreakPoint);
	    };
	    return Reaction;
	}());
	function registerErrorHandler(handler) {
	    invariant(this && this.$mobx && isReaction(this.$mobx), "Invalid `this`");
	    invariant(!this.$mobx.errorHandler, "Only one onErrorHandler can be registered");
	    this.$mobx.errorHandler = handler;
	}
	function onReactionError(handler) {
	    globalState.globalReactionErrorHandlers.push(handler);
	    return function () {
	        var idx = globalState.globalReactionErrorHandlers.indexOf(handler);
	        if (idx >= 0)
	            { globalState.globalReactionErrorHandlers.splice(idx, 1); }
	    };
	}
	/**
	 * Magic number alert!
	 * Defines within how many times a reaction is allowed to re-trigger itself
	 * until it is assumed that this is gonna be a never ending loop...
	 */
	var MAX_REACTION_ITERATIONS = 100;
	var reactionScheduler = function (f) { return f(); };
	function runReactions() {
	    // Trampolining, if runReactions are already running, new reactions will be picked up
	    if (globalState.inBatch > 0 || globalState.isRunningReactions)
	        { return; }
	    reactionScheduler(runReactionsHelper);
	}
	function runReactionsHelper() {
	    globalState.isRunningReactions = true;
	    var allReactions = globalState.pendingReactions;
	    var iterations = 0;
	    // While running reactions, new reactions might be triggered.
	    // Hence we work with two variables and check whether
	    // we converge to no remaining reactions after a while.
	    while (allReactions.length > 0) {
	        if (++iterations === MAX_REACTION_ITERATIONS) {
	            console.error("Reaction doesn't converge to a stable state after " + MAX_REACTION_ITERATIONS + " iterations." +
	                (" Probably there is a cycle in the reactive function: " + allReactions[0]));
	            allReactions.splice(0); // clear reactions
	        }
	        var remainingReactions = allReactions.splice(0);
	        for (var i = 0, l = remainingReactions.length; i < l; i++)
	            { remainingReactions[i].runReaction(); }
	    }
	    globalState.isRunningReactions = false;
	}
	var isReaction = createInstanceofPredicate("Reaction", Reaction);
	function setReactionScheduler(fn) {
	    var baseScheduler = reactionScheduler;
	    reactionScheduler = function (f) { return fn(function () { return baseScheduler(f); }); };
	}

	function asReference(value) {
	    deprecated("asReference is deprecated, use observable.ref instead");
	    return observable.ref(value);
	}
	function asStructure(value) {
	    deprecated("asStructure is deprecated. Use observable.struct, computed.struct or reaction options instead.");
	    return observable.struct(value);
	}
	function asFlat(value) {
	    deprecated("asFlat is deprecated, use observable.shallow instead");
	    return observable.shallow(value);
	}
	function asMap(data) {
	    deprecated("asMap is deprecated, use observable.map or observable.shallowMap instead");
	    return observable.map(data || {});
	}

	function createComputedDecorator(equals) {
	    return createClassPropertyDecorator(function (target, name, _, __, originalDescriptor) {
	        invariant(typeof originalDescriptor !== "undefined", getMessage("m009"));
	        invariant(typeof originalDescriptor.get === "function", getMessage("m010"));
	        var adm = asObservableObject(target, "");
	        defineComputedProperty(adm, name, originalDescriptor.get, originalDescriptor.set, equals, false);
	    }, function (name) {
	        var observable = this.$mobx.values[name];
	        if (observable === undefined // See #505
	        )
	            { return undefined; }
	        return observable.get();
	    }, function (name, value) {
	        this.$mobx.values[name].set(value);
	    }, false, false);
	}
	var computedDecorator = createComputedDecorator(comparer.default);
	var computedStructDecorator = createComputedDecorator(comparer.structural);
	/**
	 * Decorator for class properties: @computed get value() { return expr; }.
	 * For legacy purposes also invokable as ES5 observable created: `computed(() => expr)`;
	 */
	var computed = function computed(arg1, arg2, arg3) {
	    if (typeof arg2 === "string") {
	        return computedDecorator.apply(null, arguments);
	    }
	    invariant(typeof arg1 === "function", getMessage("m011"));
	    invariant(arguments.length < 3, getMessage("m012"));
	    var opts = typeof arg2 === "object" ? arg2 : {};
	    opts.setter = typeof arg2 === "function" ? arg2 : opts.setter;
	    var equals = opts.equals
	        ? opts.equals
	        : opts.compareStructural || opts.struct ? comparer.structural : comparer.default;
	    return new ComputedValue(arg1, opts.context, equals, opts.name || arg1.name || "", opts.setter);
	};
	computed.struct = computedStructDecorator;
	computed.equals = createComputedDecorator;

	function isComputed(value, property) {
	    if (value === null || value === undefined)
	        { return false; }
	    if (property !== undefined) {
	        if (isObservableObject(value) === false)
	            { return false; }
	        if (!value.$mobx.values[property])
	            { return false; }
	        var atom = getAtom(value, property);
	        return isComputedValue(atom);
	    }
	    return isComputedValue(value);
	}

	function observe(thing, propOrCb, cbOrFire, fireImmediately) {
	    if (typeof cbOrFire === "function")
	        { return observeObservableProperty(thing, propOrCb, cbOrFire, fireImmediately); }
	    else
	        { return observeObservable(thing, propOrCb, cbOrFire); }
	}
	function observeObservable(thing, listener, fireImmediately) {
	    return getAdministration(thing).observe(listener, fireImmediately);
	}
	function observeObservableProperty(thing, property, listener, fireImmediately) {
	    return getAdministration(thing, property).observe(listener, fireImmediately);
	}

	function intercept(thing, propOrHandler, handler) {
	    if (typeof handler === "function")
	        { return interceptProperty(thing, propOrHandler, handler); }
	    else
	        { return interceptInterceptable(thing, propOrHandler); }
	}
	function interceptInterceptable(thing, handler) {
	    return getAdministration(thing).intercept(handler);
	}
	function interceptProperty(thing, property, handler) {
	    return getAdministration(thing, property).intercept(handler);
	}

	/**
	 * expr can be used to create temporarily views inside views.
	 * This can be improved to improve performance if a value changes often, but usually doesn't affect the outcome of an expression.
	 *
	 * In the following example the expression prevents that a component is rerender _each time_ the selection changes;
	 * instead it will only rerenders when the current todo is (de)selected.
	 *
	 * reactiveComponent((props) => {
	 *     const todo = props.todo;
	 *     const isSelected = mobx.expr(() => props.viewState.selection === todo);
	 *     return <div className={isSelected ? "todo todo-selected" : "todo"}>{todo.title}</div>
	 * });
	 *
	 */
	function expr(expr, scope) {
	    if (!isComputingDerivation())
	        { console.warn(getMessage("m013")); }
	    // optimization: would be more efficient if the expr itself wouldn't be evaluated first on the next change, but just a 'changed' signal would be fired
	    return computed(expr, { context: scope }).get();
	}

	function toJS(source, detectCycles, __alreadySeen) {
	    if (detectCycles === void 0) { detectCycles = true; }
	    if (__alreadySeen === void 0) { __alreadySeen = []; }
	    // optimization: using ES6 map would be more efficient!
	    // optimization: lift this function outside toJS, this makes recursion expensive
	    function cache(value) {
	        if (detectCycles)
	            { __alreadySeen.push([source, value]); }
	        return value;
	    }
	    if (isObservable(source)) {
	        if (detectCycles && __alreadySeen === null)
	            { __alreadySeen = []; }
	        if (detectCycles && source !== null && typeof source === "object") {
	            for (var i = 0, l = __alreadySeen.length; i < l; i++)
	                { if (__alreadySeen[i][0] === source)
	                    { return __alreadySeen[i][1]; } }
	        }
	        if (isObservableArray(source)) {
	            var res = cache([]);
	            var toAdd = source.map(function (value) { return toJS(value, detectCycles, __alreadySeen); });
	            res.length = toAdd.length;
	            for (var i = 0, l = toAdd.length; i < l; i++)
	                { res[i] = toAdd[i]; }
	            return res;
	        }
	        if (isObservableObject(source)) {
	            var res = cache({});
	            for (var key in source)
	                { res[key] = toJS(source[key], detectCycles, __alreadySeen); }
	            return res;
	        }
	        if (isObservableMap(source)) {
	            var res_1 = cache({});
	            source.forEach(function (value, key) { return (res_1[key] = toJS(value, detectCycles, __alreadySeen)); });
	            return res_1;
	        }
	        if (isObservableValue(source))
	            { return toJS(source.get(), detectCycles, __alreadySeen); }
	    }
	    return source;
	}

	function createTransformer(transformer, onCleanup) {
	    invariant(typeof transformer === "function" && transformer.length < 2, "createTransformer expects a function that accepts one argument");
	    // Memoizes: object id -> reactive view that applies transformer to the object
	    var objectCache = {};
	    // If the resetId changes, we will clear the object cache, see #163
	    // This construction is used to avoid leaking refs to the objectCache directly
	    var resetId = globalState.resetId;
	    // Local transformer class specifically for this transformer
	    var Transformer = /** @class */ (function (_super) {
	        __extends(Transformer, _super);
	        function Transformer(sourceIdentifier, sourceObject) {
	            var _this = _super.call(this, function () { return transformer(sourceObject); }, undefined, comparer.default, "Transformer-" + transformer.name + "-" + sourceIdentifier, undefined) || this;
	            _this.sourceIdentifier = sourceIdentifier;
	            _this.sourceObject = sourceObject;
	            return _this;
	        }
	        Transformer.prototype.onBecomeUnobserved = function () {
	            var lastValue = this.value;
	            _super.prototype.onBecomeUnobserved.call(this);
	            delete objectCache[this.sourceIdentifier];
	            if (onCleanup)
	                { onCleanup(lastValue, this.sourceObject); }
	        };
	        return Transformer;
	    }(ComputedValue));
	    return function (object) {
	        if (resetId !== globalState.resetId) {
	            objectCache = {};
	            resetId = globalState.resetId;
	        }
	        var identifier = getMemoizationId(object);
	        var reactiveTransformer = objectCache[identifier];
	        if (reactiveTransformer)
	            { return reactiveTransformer.get(); }
	        // Not in cache; create a reactive view
	        reactiveTransformer = objectCache[identifier] = new Transformer(identifier, object);
	        return reactiveTransformer.get();
	    };
	}
	function getMemoizationId(object) {
	    if (typeof object === "string" || typeof object === "number")
	        { return object; }
	    if (object === null || typeof object !== "object")
	        { throw new Error("[mobx] transform expected some kind of object or primitive value, got: " + object); }
	    var tid = object.$transformId;
	    if (tid === undefined) {
	        tid = getNextId();
	        addHiddenProp(object, "$transformId", tid);
	    }
	    return tid;
	}

	function interceptReads(thing, propOrHandler, handler) {
	    var target;
	    if (isObservableMap(thing) || isObservableArray(thing) || isObservableValue(thing)) {
	        target = getAdministration(thing);
	    }
	    else if (isObservableObject(thing)) {
	        if (typeof propOrHandler !== "string")
	            { return fail("InterceptReads can only be used with a specific property, not with an object in general"); }
	        target = getAdministration(thing, propOrHandler);
	    }
	    else {
	        return fail("Expected observable map, object or array as first array");
	    }
	    if (target.dehancer !== undefined)
	        { return fail("An intercept reader was already established"); }
	    target.dehancer = typeof propOrHandler === "function" ? propOrHandler : handler;
	    return function () {
	        target.dehancer = undefined;
	    };
	}

	/**
	 * (c) Michel Weststrate 2015 - 2016
	 * MIT Licensed
	 *
	 * Welcome to the mobx sources! To get an global overview of how MobX internally works,
	 * this is a good place to start:
	 * https://medium.com/@mweststrate/becoming-fully-reactive-an-in-depth-explanation-of-mobservable-55995262a254#.xvbh6qd74
	 *
	 * Source folders:
	 * ===============
	 *
	 * - api/     Most of the public static methods exposed by the module can be found here.
	 * - core/    Implementation of the MobX algorithm; atoms, derivations, reactions, dependency trees, optimizations. Cool stuff can be found here.
	 * - types/   All the magic that is need to have observable objects, arrays and values is in this folder. Including the modifiers like `asFlat`.
	 * - utils/   Utility stuff.
	 *
	 */
	var extras = {
	    allowStateChanges: allowStateChanges,
	    deepEqual: deepEqual,
	    getAtom: getAtom,
	    getDebugName: getDebugName,
	    getDependencyTree: getDependencyTree,
	    getAdministration: getAdministration,
	    getGlobalState: getGlobalState,
	    getObserverTree: getObserverTree,
	    interceptReads: interceptReads,
	    isComputingDerivation: isComputingDerivation,
	    isSpyEnabled: isSpyEnabled,
	    onReactionError: onReactionError,
	    reserveArrayBuffer: reserveArrayBuffer,
	    resetGlobalState: resetGlobalState,
	    isolateGlobalState: isolateGlobalState,
	    shareGlobalState: shareGlobalState,
	    spyReport: spyReport,
	    spyReportEnd: spyReportEnd,
	    spyReportStart: spyReportStart,
	    setReactionScheduler: setReactionScheduler
	};
	var everything = {
	    Reaction: Reaction,
	    untracked: untracked,
	    Atom: Atom,
	    BaseAtom: BaseAtom,
	    useStrict: useStrict,
	    isStrictModeEnabled: isStrictModeEnabled,
	    spy: spy,
	    comparer: comparer,
	    asReference: asReference,
	    asFlat: asFlat,
	    asStructure: asStructure,
	    asMap: asMap,
	    isModifierDescriptor: isModifierDescriptor,
	    isObservableObject: isObservableObject,
	    isBoxedObservable: isObservableValue,
	    isObservableArray: isObservableArray,
	    ObservableMap: ObservableMap,
	    isObservableMap: isObservableMap,
	    map: map,
	    transaction: transaction,
	    observable: observable,
	    computed: computed,
	    isObservable: isObservable,
	    isComputed: isComputed,
	    extendObservable: extendObservable,
	    extendShallowObservable: extendShallowObservable,
	    observe: observe,
	    intercept: intercept,
	    autorun: autorun,
	    autorunAsync: autorunAsync,
	    when: when,
	    reaction: reaction,
	    action: action,
	    isAction: isAction,
	    runInAction: runInAction,
	    expr: expr,
	    toJS: toJS,
	    createTransformer: createTransformer,
	    whyRun: whyRun,
	    isArrayLike: isArrayLike,
	    extras: extras
	};
	var warnedAboutDefaultExport = false;
	var _loop_1 = function (p) {
	    var val = everything[p];
	    Object.defineProperty(everything, p, {
	        get: function () {
	            if (!warnedAboutDefaultExport) {
	                warnedAboutDefaultExport = true;
	                console.warn("Using default export (`import mobx from 'mobx'`) is deprecated " +
	                    "and won’t work in mobx@4.0.0\n" +
	                    "Use `import * as mobx from 'mobx'` instead");
	            }
	            return val;
	        }
	    });
	};
	for (var p in everything) {
	    _loop_1(p);
	}
	if (typeof __MOBX_DEVTOOLS_GLOBAL_HOOK__ === "object") {
	    __MOBX_DEVTOOLS_GLOBAL_HOOK__.injectMobx({ spy: spy, extras: extras });
	}

	var mobx_module = /*#__PURE__*/Object.freeze({
		extras: extras,
		Reaction: Reaction,
		untracked: untracked,
		get IDerivationState () { return IDerivationState; },
		Atom: Atom,
		BaseAtom: BaseAtom,
		useStrict: useStrict,
		isStrictModeEnabled: isStrictModeEnabled,
		spy: spy,
		comparer: comparer,
		asReference: asReference,
		asFlat: asFlat,
		asStructure: asStructure,
		asMap: asMap,
		isModifierDescriptor: isModifierDescriptor,
		isObservableObject: isObservableObject,
		isBoxedObservable: isObservableValue,
		isObservableArray: isObservableArray,
		ObservableMap: ObservableMap,
		isObservableMap: isObservableMap,
		map: map,
		transaction: transaction,
		observable: observable,
		computed: computed,
		isObservable: isObservable,
		isComputed: isComputed,
		extendObservable: extendObservable,
		extendShallowObservable: extendShallowObservable,
		observe: observe,
		intercept: intercept,
		autorun: autorun,
		autorunAsync: autorunAsync,
		when: when,
		reaction: reaction,
		action: action,
		isAction: isAction,
		runInAction: runInAction,
		expr: expr,
		toJS: toJS,
		createTransformer: createTransformer,
		whyRun: whyRun,
		trace: trace,
		isArrayLike: isArrayLike,
		default: everything
	});

	var require$$0 = ( mobx_module && everything ) || mobx_module;

	var observer_1 = createCommonjsModule(function (module, exports) {

	Object.defineProperty(exports, "__esModule", {
	  value: true
	});

	var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) { descriptor.writable = true; } Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) { defineProperties(Constructor.prototype, protoProps); } if (staticProps) { defineProperties(Constructor, staticProps); } return Constructor; }; }();

	exports.observer = observer;
	exports.setComponent = setComponent;
	exports.makeObserver = makeObserver;

	var _mobx = require$$0;

	function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

	function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

	function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) { Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } }

	var Component = void 0;

	/**
	 * Observer decorator
	 */
	function observer(componentClass) {
	  if (componentClass.prototype.hasOwnProperty('componentDidMount')) {
	    (function () {
	      var originalDidMount = componentClass.prototype.componentDidMount;
	      componentClass.prototype.componentDidMount = function () {
	        var _this = this;

	        this.disposer = (0, _mobx.autorun)(function () {
	          _this.render();
	          _this.forceUpdate();
	        });
	        originalDidMount.call(this);
	      };
	    })();
	  } else {
	    componentClass.prototype.componentDidMount = function () {
	      var _this2 = this;

	      this.disposer = (0, _mobx.autorun)(function () {
	        _this2.render();
	        _this2.forceUpdate();
	      });
	    };
	  }
	  if (componentClass.prototype.hasOwnProperty('componentWillUnmount')) {
	    (function () {
	      var originalUnmount = componentClass.prototype.componentWillUnmount;
	      componentClass.prototype.componentWillUnmount = function () {
	        this.disposer();
	        originalUnmount.call(this);
	      };
	    })();
	  } else {
	    componentClass.prototype.componentWillUnmount = function () {
	      this.disposer();
	    };
	  }
	  return componentClass;
	}

	function setComponent(comp) {
	  Component = comp;
	}

	function makeObserver(fn) {
	  var Cl = function (_Component) {
	    _inherits(Cl, _Component);

	    function Cl() {
	      _classCallCheck(this, Cl);

	      return _possibleConstructorReturn(this, Object.getPrototypeOf(Cl).apply(this, arguments));
	    }

	    _createClass(Cl, [{
	      key: 'componentDidMount',
	      value: function componentDidMount() {
	        var _this4 = this;

	        this.disposer = (0, _mobx.autorun)(function () {
	          _this4.render();
	          _this4.forceUpdate();
	        });
	      }
	    }, {
	      key: 'render',
	      value: function render() {
	        return fn(this.props);
	      }
	    }, {
	      key: 'componentWillUnmount',
	      value: function componentWillUnmount() {
	        this.disposer();
	      }
	    }]);

	    return Cl;
	  }(Component);

	  return Cl;
	}


	});

	unwrapExports(observer_1);
	var observer_2 = observer_1.observer;
	var observer_3 = observer_1.setComponent;
	var observer_4 = observer_1.makeObserver;

	var Socket = function Socket(config) {
	  var this$1 = this;

	  this.connection = new WebSocket("ws://localhost:8000");
	  this.connection.onopen = function (msg) {
	    console.log("Socket ready");
	    this$1.ready = true;
	  };
	  this.connection.onerror = this.error.bind(this);
	  this.ready = false;
	};

	Socket.prototype.send = function send (message) {
	  this.connection.send(JSON.stringify(message));
	};

	Socket.prototype.error = function error (err) {
	  console.log(err);
	};

	var keys = {
	  W: 87,
	  S: 83,
	  A: 65,
	  D: 68,
	  UP: 38,
	  DOWN: 40,
	  SHIFT: 16
	};

	var ListenKeys = function ListenKeys() {
	  this.keys = {};
	  this.keymap = keys;
	  this.listenKeys(this.keys);
	};

	ListenKeys.prototype.on = function on (key, callback) {
	  if (this.keys[key]) {
	    callback();
	  } else {
	    return false;
	  }
	};

	ListenKeys.prototype.listenKeys = function listenKeys (keys$$1) {
	  var keysPressed = function (e) {
	    keys$$1[e.keyCode] = true;
	  };

	  var keysReleased = function (e) {
	    keys$$1[e.keyCode] = false;
	  };

	  window.onkeydown = keysPressed;
	  window.onkeyup = keysReleased;
	};

	var Bullet = function Bullet(params) {
	  this.bullet = this.createBullet(params.bullet || "default");
	  this.bullet.rotation = params.weapon.rotation;
	  this.bullet.speed = 5;
	  this.bullet.delay = 300;
	  this.bullet.ammo = 60;
	  this.bullet.range = 600;
	  this.bullet.reload = 2000;
	  this.bullet.pos = params.pos;
	  if (params.pos === "L") {
	    this.bullet.scale.x = -1;
	    this.bullet.x = params.x + Math.sin(params.weapon.rotation) * 40;
	    this.bullet.y = params.y + Math.cos(params.weapon.rotation) * 20;
	  } else {
	    this.bullet.scale.x = 1;
	    this.bullet.x = params.x + Math.cos(params.weapon.rotation) * 30;
	    this.bullet.y = params.y + Math.sin(params.weapon.rotation) * 20;
	  }
	  return this.bullet;
	};

	Bullet.prototype.createBullet = function createBullet () {
	  var bullet = new PIXI.Graphics();
	  bullet.beginFill(0xff3300);
	  bullet.moveTo(50, 50);
	  bullet.lineTo(30, 50);
	  bullet.lineTo(90, 50);
	  bullet.lineTo(90, 60);
	  bullet.lineTo(30, 60);
	  bullet.endFill();
	  return bullet;
	};

	var Player = function Player(params) {
	  this.player = this.createAnimation();
	  this.player.pos = params.pos;
	  this.player.anchor.x = 0.5;
	  this.player.anchor.y = 0.5;
	  return this.player;
	};

	Player.prototype.createAnimation = function createAnimation () {
	  var frames = [];
	  for (var i = 0; i < 3; i++) {
	    frames.push(PIXI.Texture.fromFrame("worm" + i + ".png"));
	  }
	  var anim = new PIXI.extras.AnimatedSprite(frames);
	  anim.animationSpeed = 0.2;
	  anim.play();
	  return anim;
	};

	var Weapon = function Weapon(params) {
	  this.weapon = new PIXI.Sprite.fromFrame("uzi");
	  this.weapon.x = 5;
	  this.weapon.y = 5;
	  this.weapon.rotation = params.value.weapon.rotation;
	  this.weapon.anchor.set(0.7, 0.5);
	  return this.weapon;
	};

	var Render = function Render(config) {
	  this.renderer = new PIXI.WebGLRenderer(config.width, config.height);
	  this.renderer.backgroundColor = 0x061639;
	  this.config = config;
	  this.keys = new ListenKeys();
	  this.run = this.run.bind(this);
	  this.world = new PIXI.Container();
	  this.stage = new PIXI.Container();
	  this.background = new PIXI.Container();
	  this.world.addChild(this.background);
	  this.world.addChild(this.stage);
	  document.getElementById("gameWindow").appendChild(this.renderer.view);
	};

	Render.prototype.getPlayer = function getPlayer (player) {
	    if ( player === void 0 ) player = this.player;

	  return this.stage.children.filter(function (item) { return item.id === player; })[0];
	};

	Render.prototype.findDeletedPlayer = function findDeletedPlayer (id) {
	  var leftPlayer = this.getPlayer(id);
	  this.stage.removeChild(leftPlayer);
	};

	Render.prototype.createPlayerName = function createPlayerName (name) {
	  var style = new PIXI.TextStyle({
	    fontFamily: "Arial",
	    fontSize: 11,
	    fontWeight: "bold",
	    fill: ["#ffffff"]
	  });
	  return new PIXI.Text(name, style);
	};

	Render.prototype.addPlayer = function addPlayer (player) {
	  var PlayerModel = new PIXI.Container();
	  var PlayerWorm = new Player(player);
	  var PlayerWeapon = new Weapon(player);
	  var PlayerName = this.createPlayerName(player.key);
	  PlayerName.x = -8;
	  PlayerName.y = -35;
	  PlayerModel.pos = player.value.pos;
	  PlayerModel.x = player.value.x;
	  PlayerModel.x = player.value.y;
	  PlayerModel.addChild(PlayerWorm);
	  PlayerModel.addChild(PlayerWeapon);
	  PlayerModel.addChild(PlayerName);
	  PlayerModel.id = player.key;
	  PlayerModel.zOrder = 5;
	  this.stage.addChild(PlayerModel);
	};

	Render.prototype.addBackground = function addBackground (config) {
	  var backgroundIMG = new PIXI.Sprite(
	    PIXI.loader.resources["background"].texture
	  );
	  backgroundIMG.width = window.innerWidth;
	  backgroundIMG.height = window.innerHeight;
	  this.background.addChild(backgroundIMG);
	};

	Render.prototype.loadResources = function loadResources (resources) {
	  resources.forEach(function (resource) {
	    PIXI.loader.add(resource.key, resource.src);
	  });
	};

	Render.prototype.run = function run () {
	  requestAnimationFrame(this.run);
	  this.renderer.render(this.world);
	};

	var Physics = function Physics() {
	  this.container = new p2.World({
	    gravity: [0, 5.82]
	  });
	  this.polygons = new Map();
	};

	Physics.prototype.addModel = function addModel (model) {
	  this.container.addBody(model);
	};

	Physics.prototype.findDeletedPlayer = function findDeletedPlayer (id) {
	  var model = this.getModel(id);
	  this.container.removeBody(model);
	};

	Physics.prototype.addPlayer = function addPlayer (player) {
	  var polygonBody = new p2.Body({
	    mass: 3,
	    position: [player.value.x, player.value.y],
	    fixedRotation: true,
	    velocity: [5, 0]
	  });
	  polygonBody.id = player.key;
	  polygonBody.pos = player.value.pos;
	  polygonBody.weapon = player.value.weapon;
	  polygonBody.fromPolygon(this.polygons.get("worm"));
	  this.addModel(polygonBody);
	};

	Physics.prototype.updatePosition = function updatePosition (player) {
	  var currentPlayer = this.getModel(player.key);
	  currentPlayer.position[0] = player.value.x;
	  currentPlayer.weapon = player.value.weapon;
	  currentPlayer.pos = player.value.pos;
	  return {
	    model: currentPlayer,
	    x: currentPlayer.position[0],
	    y: currentPlayer.position[1],
	    weapon: currentPlayer.weapon
	  };
	};

	Physics.prototype.setPolygon = function setPolygon (id, polygon) {
	  this.polygons.set(id, polygon);
	};

	Physics.prototype.getModel = function getModel (id) {
	  return this.container.bodies.filter(function (item) { return item.id === id; })[0];
	};

	var loadModels = function (data, stage, physics) {
	  var colHeight = data.height / data.tilesGrid;
	  var colWidth = data.width / data.tilesWidth;
	  var groundLevel = window.innerHeight;
	  data.tilesMap.forEach(function (item, index) {
	    var Sprite = new PIXI.Sprite.fromFrame(("" + (item.tile)));
	    var SpriteCount = item.x.to !== item.x.from
	      ? Math.floor((item.x.to - item.x.from) / Sprite.width)
	      : 1;

	    for (var i = 0; i < SpriteCount; i++) {
	      var newSprite = new PIXI.Sprite.fromFrame(("" + (item.tile)));
	      if (item.y.from !== item.y.to) {
	        newSprite.y = window.innerHeight -
	          Sprite.height -
	          item.y.from -
	          (Sprite.height * i - 3);
	      } else {
	        newSprite.y = window.innerHeight - Sprite.height - item.y.from;
	      }
	      if (item.x.from === item.x.to) {
	        newSprite.x = item.x.from;
	      } else {
	        newSprite.x = item.x.from + (Sprite.width * i - 3);
	      }
	      stage.addChild(newSprite);
	    }
	    if (item.polygon) {
	      var polygonY = window.innerHeight - item.polygon.y;
	      var polygonBody = new p2.Body({
	        position: [item.polygon.x, polygonY]
	      });
	      polygonBody.fromPolygon(item.polygon.map);
	      physics.addModel(polygonBody);
	    }
	  });
	};

	var Gamefield$$1 = function Gamefield$$1(renderer, physics) {
	  this.player = null;
	  this.renderer = renderer;
	  this.physics = physics;
	  this.actions = new Actions(renderer.stage);
	  this.ticker = new PIXI.ticker.Ticker();
	};

	Gamefield$$1.prototype.update = function update (data) {
	    var this$1 = this;

	  data.forEach(function (player) {
	    this$1.updatePlayerPosition(player);
	  });
	};

	Gamefield$$1.prototype.addPlayer = function addPlayer (player) {
	  this.physics.addPlayer(player);
	  this.renderer.addPlayer(player);
	  var playerData = this.renderer.getPlayer(player.key);
	  if (playerData) {
	    this.actions.playerTurn(playerData, player.value);
	  }
	};

	Gamefield$$1.prototype.updatePlayerPosition = function updatePlayerPosition (player) {
	  var playerData = this.renderer.getPlayer(player.key);

	  if (!playerData) {
	    // Server sends more players, than client has online
	    this.addPlayer(player);
	  } else {
	    //Player has turned
	    if (player.value.pos !== playerData.pos) {
	      this.actions.playerTurn(playerData, player.value);
	    }


	    var physicsPos = this.physics.updatePosition(player);

	    if (player.value.jump) {
	      physicsPos.model.velocity[1] = -70;
	      if (player.value.pos === "R") {
	        physicsPos.model.velocity[0] = 10;
	      } else {
	        physicsPos.model.velocity[0] = -10;
	      }
	    }

	    playerData.children[1].rotation = physicsPos.weapon.rotation;
	    playerData.pos = player.value.pos;
	  }
	  if (player.value.shot) {
	    this.actions.shoot(JSON.parse(player.value.shot));
	  }
	};

	Gamefield$$1.prototype.initialize = function initialize (data) {
	    var this$1 = this;

	  this.ticker.start();
	  return new Promise(function (resolve) {
	    PIXI.loader.load(function () {
	      data.payload.forEach(function (player) {
	        this$1.addPlayer(player);
	      });
	      this$1.renderer.addBackground();
	      loadModels(data.currentMap, this$1.renderer.stage, this$1.physics);
	      this$1.renderer.run();
	      this$1.ticker.add(function () {
	        this$1.physics.container.bodies.forEach(function (player) {
	          var renderModel = this$1.renderer.getPlayer(player.id);
	          if (renderModel) {
	            if (renderModel.x !== player.position[0]) {
	              renderModel.children[0].loop = true;
	              renderModel.children[0].playing = true;
	            } else {
	              renderModel.children[0].playing = false;
	              renderModel.children[0].loop = false;
	            }
	            renderModel.x = player.position[0];
	            renderModel.y = player.position[1];
	            //update renderer stats based on server values
	            if (player.id === this$1.player) {
	              this$1.renderer.stage.pivot.x =
	                renderModel.x - window.innerWidth / 2;
	            }
	          }
	        });
	      });
	      resolve();
	    });
	  });
	};

	var Actions = function Actions(stage) {
	  this.shots = new Map();
	  this.stage = stage;
	};

	Actions.prototype.shoot = function shoot (stats) {
	  var bullet = new Bullet(stats);
	  bullet.uuid = PIXI.utils.uuid();
	  this.shots.set(bullet.uuid, bullet);
	  this.stage.addChild(bullet);
	};

	Actions.prototype.playerTurn = function playerTurn (model, values) {
	  var gun = model.children[1], worm = model.children[0];
	  if (values.pos === 'L') {
	    worm.scale.x = -1;
	    gun.scale.x = -1;
	    gun.x = -25;
	  } else if (values.pos === 'R') {
	    worm.scale.x = 1;
	    gun.scale.x = 1;
	    gun.x = 25;
	  }
	};

	var renderConfig = {
	  width: window.innerWidth,
	  height: window.innerHeight - 10
	},
	  timeouts = {
	    jump: { value: false, time: 1500 },
	    shoot: { value: false, time: 200 }
	  };

	var renderer = new Render(renderConfig);
	var physics = new Physics();
	var gamefield = new Gamefield$$1(renderer, physics);
	var key = renderer.keys.keymap;

	var animations = function (currentPlayer) {
	  var stats = {
	    player: gamefield.player,
	    y: currentPlayer.position[1],
	    x: currentPlayer.position[0],
	    pos: currentPlayer.pos,
	    weapon: {
	      rotation: currentPlayer.weapon.rotation
	    },
	    shot: null,
	    jump: null
	  };

	  renderer.keys.on(key.W, function () {
	    if (!timeouts.jump.value) {
	      stats.jump = true;
	      timeouts.jump.value = true;
	      setTimeout(function () {
	        timeouts.jump.value = false;
	      }, timeouts.jump.time);
	    }

	    store.socket.send({
	      type: "update",
	      serverId: store.state.currentserver.id,
	      stats: stats
	    });
	  });

	  renderer.keys.on(key.A, function () {
	    stats.x -= 6;
	    stats.pos = "L";
	    store.socket.send({
	      type: "update",
	      serverId: store.state.currentserver.id,
	      stats: stats
	    });
	  });

	  renderer.keys.on(key.D, function () {
	    stats.x += 6;
	    stats.pos = "R";
	    store.socket.send({
	      type: "update",
	      serverId: store.state.currentserver.id,
	      stats: stats
	    });
	  });

	  renderer.keys.on(key.UP, function () {
	    if (stats.pos === "R") {
	      stats.weapon.rotation -= 0.1;
	    } else {
	      stats.weapon.rotation += 0.1;
	    }
	    store.socket.send({
	      type: "update",
	      serverId: store.state.currentserver.id,
	      stats: stats
	    });
	  });

	  renderer.keys.on(key.DOWN, function () {
	    if (stats.pos === "R") {
	      stats.weapon.rotation += 0.1;
	    } else {
	      stats.weapon.rotation -= 0.1;
	    }
	    store.socket.send({
	      type: "update",
	      serverId: store.state.currentserver.id,
	      stats: stats
	    });
	  });

	  renderer.keys.on(key.SHIFT, function () {
	    if (!timeouts.shoot.value) {
	      stats.shot = JSON.stringify(stats);
	      timeouts.shoot.value = true;
	      setTimeout(function () {
	        timeouts.shoot.value = false;
	      }, timeouts.shoot.time);
	    }
	    store.socket.send({
	      type: "update",
	      serverId: store.state.currentserver.id,
	      stats: stats
	    });
	  });
	};

	var Game = function Game(player) {
	  this.player = player;
	  gamefield.player = player;
	};

	Game.prototype.handleConnection = function handleConnection (response) {
	    var this$1 = this;

	  switch (response.type) {
	    case "init":
	      console.log("Start loading resources", response);
	      document.getElementsByTagName("body")[0].classList.add("active");
	      var resources = [
	        { key: "worm", src: response.skins.worm.default },
	        { key: "guns", src: response.skins.guns },
	        { key: "background", src: response.currentMap.background },
	        { key: "mapObjects", src: response.currentMap.objects },
	        { key: "tiles", src: response.currentMap.tiles }
	      ];
	      physics.setPolygon("worm", response.skins.worm.polygon);
	      renderer.stage.width = response.width;
	      renderer.stage.height = response.height;
	      renderer.loadResources(resources);

	      gamefield.initialize(response).then(function () {
	        console.log("Files loaded");
	        store.socket.send({
	          type: "ready",
	          player: this$1.player,
	          serverId: store.state.currentserver.id
	        });
	        this$1.startAnimations();

	      });
	      break;

	    case "update":
	      gamefield.update(response.payload);
	      break;

	    case "disconnect":
	      renderer.findDeletedPlayer(response.payload);
	      physics.findDeletedPlayer(response.payload);
	      break;
	  }
	};

	Game.prototype.addPlayerToServer = function addPlayerToServer (player, serverId) {
	  store.socket.send({
	    type: "addPlayer",
	    player: player,
	    serverId: serverId
	  });
	};

	Game.prototype.startServer = function startServer () {
	  store.socket.send({
	    type: "startServer",
	    player: this.player,
	    serverId: store.state.currentserver.id
	  });
	};

	Game.prototype.startAnimations = function startAnimations () {
	  var FPS = 60;



	  setInterval(function () {
	    physics.container.step(1 / 5);

	    var model = physics.getModel(gamefield.player);
	    if (model) {
	      animations(model);
	    }

	    gamefield.actions.shots.forEach(function (bullet) {
	      if (bullet.pos === "R") {
	        bullet.x += Math.cos(bullet.rotation) * bullet.speed;
	        bullet.y += Math.sin(bullet.rotation) * bullet.speed;
	      } else {
	        bullet.x -= Math.cos(bullet.rotation) * bullet.speed;
	        bullet.y -= Math.sin(bullet.rotation) * bullet.speed;
	      }
	      if (
	        bullet.x - model.position[0] > bullet.range ||
	        bullet.x - model.position[0] < -bullet.range ||
	        bullet.x === 0 ||
	        bullet.y - model.position[1] > bullet.range ||
	        bullet.y - model.position[1] < -bullet.range ||
	        bullet.y === 0
	      ) {
	        renderer.stage.removeChild(bullet);
	        gamefield.actions.shots.delete(bullet.uuid);
	      }
	    });
	  }, 1000 / FPS);
	};

	var Store = function Store() {
	  var this$1 = this;

	  this.socket = new Socket();
	  this.player = null;

	  this.state = observable({
	    serverlist: [],
	    currentserver: null
	  });

	  this.socket.connection.onmessage = function (data) {
	    var response = JSON.parse(data.data);
	    if (response.type === "serversInfo") {
	      this$1.state.serverlist = response.payload;
	      if (this$1.state.currentserver) {
	        this$1.state.currentserver = this$1.state.serverlist.filter(
	          function (server) { return server.id === this$1.state.currentserver.id; }
	        )[0];
	      }
	    }
	  };
	};

	Store.prototype.joinRoom = function joinRoom (serverUID) {
	    var this$1 = this;

	  this.game = new Game(this.player);
	  this.game.addPlayerToServer(this.player, serverUID);
	  this.state.currentserver = this.state.serverlist.filter(
	    function (server) { return server.id === serverUID; }
	  )[0];

	  this.socket.connection.onmessage = function (data) {
	    var response = JSON.parse(data.data);
	    if (response.type === "serversInfo") {
	      this$1.state.serverlist = response.payload;
	      if (this$1.state.currentserver) {
	        this$1.state.currentserver = this$1.state.serverlist.filter(
	          function (server) { return server.id === this$1.state.currentserver.id; }
	        )[0];
	      }
	    }
	    this$1.game.handleConnection(response);
	  };
	};

	Store.prototype.startGame = function startGame () {
	  this.game.startServer(this.state.currentserver.id);
	};

	var store = new Store();

	observer_3(Component);
	var ServerList = (function (Component$$1) {
	  function ServerList () {
	    Component$$1.apply(this, arguments);
	  }

	  if ( Component$$1 ) ServerList.__proto__ = Component$$1;
	  ServerList.prototype = Object.create( Component$$1 && Component$$1.prototype );
	  ServerList.prototype.constructor = ServerList;

	  ServerList.prototype.joinServer = function joinServer (uid) {
	    store.joinRoom(uid);
	    route({ url: "/game" });
	  };

	  ServerList.prototype.render = function render$$1 () {
	    var this$1 = this;

	    return (
	      h( 'div', { id: "server-list" },
	        store.state.serverlist.map(function (server) {
	          return (
	            h( 'div', { className: "server-list-item" },
	              h( 'span', null, ("Name: " + (server.name)) ),
	              h( 'span', null, ("Map: " + (server.map)) ),
	              h( 'span', null, ("Online: " + (server.online)) ),
	              h( 'button', { onClick: this$1.joinServer.bind(this$1, server.id) }, "Join")
	            )
	          );
	        })
	      )
	    );
	  };

	  return ServerList;
	}(Component));

	var Serverlist = observer_2(ServerList);

	var Login = (function (Component$$1) {
	  function Login() {
	    Component$$1.call(this);
	  }

	  if ( Component$$1 ) Login.__proto__ = Component$$1;
	  Login.prototype = Object.create( Component$$1 && Component$$1.prototype );
	  Login.prototype.constructor = Login;
	  Login.prototype.login = function login () {
	    var username = document.getElementById("username");
	    store.player =
	      username.value ||
	      ("player" + (Math.floor(Math.random() * (5 - 1 + 1) + 100)));
	    console.log("login success");
	    route("/servers");
	  };
	  Login.prototype.render = function render$$1 () {
	    return (
	      h( 'div', { id: "login-page" },
	        h( 'label', { htmlFor: "username" }, "Username:"),
	        h( 'input', { id: "username", type: "text" }),
	        h( 'div', { onClick: this.login, id: "login-submit" }, "Login")
	      )
	    );
	  };

	  return Login;
	}(Component));

	observer_3(Component);
	var Room = (function (Component$$1) {
	  function Room () {
	    Component$$1.apply(this, arguments);
	  }

	  if ( Component$$1 ) Room.__proto__ = Component$$1;
	  Room.prototype = Object.create( Component$$1 && Component$$1.prototype );
	  Room.prototype.constructor = Room;

	  Room.prototype.startGame = function startGame () {
	    store.startGame();
	    route({ url: "/serverlist" });
	  };

	  Room.prototype.componentWillMount = function componentWillMount () {
	    if (!store.state.currentserver) { route("/"); }
	  };

	  Room.prototype.render = function render$$1 () {
	    return (
	      h( 'div', { id: "room-page" },
	        h( 'section', { id: "room-details" },
	          h( 'h3', null, store.state.currentserver.name ),
	          h( 'section', { id: "players-list" },
	            h( 'h4', null, "Players:" ),
	            store.state.currentserver.players.map(function (player) {
	              return h( 'span', null, " ", player.key );
	            })
	          ),
	          h( 'span', { id: "start-game", onClick: this.startGame }, store.state.currentserver.active ? "Join game" : "Start server")
	        )
	      )
	    );
	  };

	  return Room;
	}(Component));

	var Room$1 = observer_2(Room);

	var Routes = (function (Component$$1) {
	  function Routes() {
	    Component$$1.call(this);
	  }

	  if ( Component$$1 ) Routes.__proto__ = Component$$1;
	  Routes.prototype = Object.create( Component$$1 && Component$$1.prototype );
	  Routes.prototype.constructor = Routes;
	  Routes.prototype.render = function render$$1 () {
	    return (
	      h( 'section', { id: "container" },
	        h( Router, null,
	          h( Login, { path: "/" }),
	          h( Serverlist, { path: "/servers" }),
	          h( Room$1, { path: "/game" })
	        )
	      )
	    );
	  };

	  return Routes;
	}(Component));

	render(h( Routes, null ), document.getElementById("UX"));

}());
