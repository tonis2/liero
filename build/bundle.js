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

	// if a "vnode hook" is defined, pass every created VNode to it
	if (options.vnode) { options.vnode(p); }

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

var EMPTY$1$1 = {};

var ATTR_KEY = typeof Symbol!=='undefined' ? Symbol.for('preactattr') : '__preactattr_';

// DOM properties that should NOT have "px" added when numeric
var NON_DIMENSION_PROPS = {
	boxFlex:1, boxFlexGroup:1, columnCount:1, fillOpacity:1, flex:1, flexGrow:1,
	flexPositive:1, flexShrink:1, flexNegative:1, fontWeight:1, lineClamp:1, lineHeight:1,
	opacity:1, order:1, orphans:1, strokeOpacity:1, widows:1, zIndex:1, zoom:1
};

// DOM event types that do not bubble and should be attached via useCapture
var NON_BUBBLING_EVENTS = { blur:1, error:1, focus:1, load:1, resize:1, scroll:1 };

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

var items = [];

function enqueueRender(component) {
	if (!component._dirty && (component._dirty = true) && items.push(component)==1) {
		(options.debounceRendering || defer)(rerender);
	}
}


function rerender() {
	var p, list = items;
	items = [];
	while ( (p = list.pop()) ) {
		if (p._dirty) { renderComponent(p); }
	}
}

function isFunctionalComponent(vnode) {
	var nodeName = vnode && vnode.nodeName;
	return nodeName && isFunction(nodeName) && !(nodeName.prototype && nodeName.prototype.render);
}



/** Construct a resultant VNode from a VNode referencing a stateless functional component.
 *	@param {VNode} vnode	A VNode with a `nodeName` property that is a reference to a function.
 *	@private
 */
function buildFunctionalComponent(vnode, context) {
	return vnode.nodeName(getNodeProps(vnode), context || EMPTY$1$1);
}

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

	if (name==='key') {
		// ignore
	}
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
	return this._listeners[e.type](options.event && options.event(e) || e);
}

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
		if (options.afterMount) { options.afterMount(c); }
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
		if (options.afterUpdate) { options.afterUpdate(component); }
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
	if (options.beforeUnmount) { options.beforeUnmount(component); }

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

function render(vnode, parent, merge) {
	return diff(merge, vnode, {}, false, parent);
}

var EMPTY$1 = {};

function exec(url, route) {
	var opts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : EMPTY$1;

	var reg = /(?:\?([^#]*))?(#.*)?$/,
	    c = url.match(reg),
	    matches = {},
	    ret = void 0;
	if (c && c[1]) {
		var p = c[1].split('&');
		for (var i = 0; i < p.length; i++) {
			var r = p[i].split('=');
			matches[decodeURIComponent(r[0])] = decodeURIComponent(r.slice(1).join('='));
		}
	}
	url = segmentize(url.replace(reg, ''));
	route = segmentize(route || '');
	var max = Math.max(url.length, route.length);
	for (var _i = 0; _i < max; _i++) {
		if (route[_i] && route[_i].charAt(0) === ':') {
			var param = route[_i].replace(/(^\:|[+*?]+$)/g, ''),
			    flags = (route[_i].match(/[+*?]+$/) || EMPTY$1)[0] || '',
			    plus = ~flags.indexOf('+'),
			    star = ~flags.indexOf('*'),
			    val = url[_i] || '';
			if (!val && !star && (flags.indexOf('?') < 0 || plus)) {
				ret = false;
				break;
			}
			matches[param] = decodeURIComponent(val);
			if (plus || star) {
				matches[param] = url.slice(_i).map(decodeURIComponent).join('/');
				break;
			}
		} else if (route[_i] !== url[_i]) {
			ret = false;
			break;
		}
	}
	if (opts.default !== true && ret === false) { return false; }
	return matches;
}

function pathRankSort(a, b) {
	var aAttr = a.attributes || EMPTY$1,
	    bAttr = b.attributes || EMPTY$1;
	if (aAttr.default) { return 1; }
	if (bAttr.default) { return -1; }
	var diff = rank(aAttr.path) - rank(bAttr.path);
	return diff || aAttr.path.length - bAttr.path.length;
}

function segmentize(url) {
	return strip(url).split('/');
}

function rank(url) {
	return (strip(url).match(/\/+/g) || '').length;
}

function strip(url) {
	return url.replace(/(^\/+|\/+$)/g, '');
}

var _extends = Object.assign || function (target) {
var arguments$1 = arguments;
 for (var i = 1; i < arguments.length; i++) { var source = arguments$1[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) { Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } }

var customHistory = null;

var ROUTERS = [];

var EMPTY = {};

function isPreactElement(node) {
	return node.__preactattr_ != null || typeof Symbol !== 'undefined' && node[Symbol.for('preactattr')] != null;
}

function setUrl(url) {
	var type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'push';

	if (customHistory && customHistory[type]) {
		customHistory[type](url);
	} else if (typeof history !== 'undefined' && history[type + 'State']) {
		history[type + 'State'](null, null, url);
	}
}

function getCurrentUrl() {
	var url = void 0;
	if (customHistory && customHistory.location) {
		url = customHistory.location;
	} else if (customHistory && customHistory.getCurrentLocation) {
		url = customHistory.getCurrentLocation();
	} else {
		url = typeof location !== 'undefined' ? location : EMPTY;
	}
	return '' + (url.pathname || '') + (url.search || '');
}

function route(url) {
	var replace = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

	if (typeof url !== 'string' && url.url) {
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
	for (var i = ROUTERS.length; i--;) {
		if (ROUTERS[i].canRoute(url)) { return true; }
	}
	return false;
}

/** Tell all router instances to handle the given URL.  */
function routeTo(url) {
	var didRoute = false;
	for (var i = 0; i < ROUTERS.length; i++) {
		if (ROUTERS[i].routeTo(url) === true) {
			didRoute = true;
		}
	}
	return didRoute;
}

function routeFromLink(node) {
	// only valid elements
	if (!node || !node.getAttribute) { return; }

	var href = node.getAttribute('href'),
	    target = node.getAttribute('target');

	// ignore links with targets and non-path URLs
	if (!href || !href.match(/^\//g) || target && !target.match(/^_?self$/i)) { return; }

	// attempt to route, if no match simply cede control to browser
	return route(href);
}

function handleLinkClick(e) {
	if (e.button !== 0) { return; }
	routeFromLink(e.currentTarget || e.target || this);
	return prevent(e);
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
	if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.button !== 0) { return; }

	var t = e.target;
	do {
		if (String(t.nodeName).toUpperCase() === 'A' && t.getAttribute('href') && isPreactElement(t)) {
			if (t.hasAttribute('native')) { return; }
			// if link is handled by the router, prevent browser defaults
			if (routeFromLink(t)) {
				return prevent(e);
			}
		}
	} while (t = t.parentNode);
}

var eventListenersInitialized = false;

function initEventListeners() {
	if (eventListenersInitialized) {
		return;
	}

	if (typeof addEventListener === 'function') {
		if (!customHistory) {
			addEventListener('popstate', function () {
				return routeTo(getCurrentUrl());
			});
		}
		addEventListener('click', delegateLinkHandler);
	}
	eventListenersInitialized = true;
}

var Link = function Link(props) {
	return h('a', _extends({}, props, { onClick: handleLinkClick }));
};

var Router = function (_Component) {
	_inherits(Router, _Component);

	function Router(props) {
		_classCallCheck(this, Router);

		var _this = _possibleConstructorReturn(this, _Component.call(this, props));

		if (props.history) {
			customHistory = props.history;
		}

		_this.state = {
			url: _this.props.url || getCurrentUrl()
		};

		initEventListeners();
		return _this;
	}

	Router.prototype.shouldComponentUpdate = function shouldComponentUpdate(props) {
		if (props.static !== true) { return true; }
		return props.url !== this.props.url || props.onChange !== this.props.onChange;
	};

	/** Check if the given URL can be matched against any children */


	Router.prototype.canRoute = function canRoute(url) {
		return this.getMatchingChildren(this.props.children, url, false).length > 0;
	};

	/** Re-render children with a new URL to match against. */


	Router.prototype.routeTo = function routeTo(url) {
		this._didRoute = false;
		this.setState({ url: url });

		// if we're in the middle of an update, don't synchronously re-route.
		if (this.updating) { return this.canRoute(url); }

		this.forceUpdate();
		return this._didRoute;
	};

	Router.prototype.componentWillMount = function componentWillMount() {
		ROUTERS.push(this);
		this.updating = true;
	};

	Router.prototype.componentDidMount = function componentDidMount() {
		var _this2 = this;

		if (customHistory) {
			this.unlisten = customHistory.listen(function (location) {
				_this2.routeTo('' + (location.pathname || '') + (location.search || ''));
			});
		}
		this.updating = false;
	};

	Router.prototype.componentWillUnmount = function componentWillUnmount() {
		if (typeof this.unlisten === 'function') { this.unlisten(); }
		ROUTERS.splice(ROUTERS.indexOf(this), 1);
	};

	Router.prototype.componentWillUpdate = function componentWillUpdate() {
		this.updating = true;
	};

	Router.prototype.componentDidUpdate = function componentDidUpdate() {
		this.updating = false;
	};

	Router.prototype.getMatchingChildren = function getMatchingChildren(children, url, invoke) {
		return children.slice().sort(pathRankSort).map(function (vnode) {
			var path = vnode.attributes.path,
			    matches = exec(url, path, vnode.attributes);
			if (matches) {
				if (invoke !== false) {
					var newProps = { url: url, matches: matches };
					// copy matches onto props
					for (var i in matches) {
						if (matches.hasOwnProperty(i)) {
							newProps[i] = matches[i];
						}
					}
					return cloneElement(vnode, newProps);
				}
				return vnode;
			}
			return false;
		}).filter(Boolean);
	};

	Router.prototype.render = function render$$1(_ref, _ref2) {
		var children = _ref.children,
		    onChange = _ref.onChange;
		var url = _ref2.url;

		var active = this.getMatchingChildren(children, url, true);

		var current = active[0] || null;
		this._didRoute = !!current;

		var previous = this.previousUrl;
		if (url !== previous) {
			this.previousUrl = url;
			if (typeof onChange === 'function') {
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
}(Component);

var Route = function Route(props) {
	return h(props.component, props);
};

Router.route = route;
Router.Router = Router;
Router.Route = Route;
Router.Link = Link;


//# sourceMappingURL=preact-router.es.js.map

var Socket = function Socket(config) {
  var this$1 = this;

  this.connection = new WebSocket(config.url);
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
  this.bullet = new PIXI.Sprite.fromFrame("bullet");
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

var Player = function Player(params) {
  this.player = new PIXI.Sprite.fromFrame(params.value.skin);
  this.player.pos = params.pos;
  this.player.anchor.x = 0.5;
  this.player.anchor.y = 0.5;
  return this.player;
};

var Weapon = function Weapon(params) {
  this.weapon = new PIXI.Sprite.fromFrame(params.value.weapon.skin);
  this.weapon.x = 5;
  this.weapon.y = 5;
  this.weapon.rotation = params.value.weapon.rotation;
  this.weapon.anchor.set(0.7, 0.5);
  return this.weapon;
};

var Render$1 = function Render(config) {
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

Render$1.prototype.getPlayer = function getPlayer (player) {
    if ( player === void 0 ) player = this.player;

  return this.stage.children.filter(function (item) { return item.id === player; })[0];
};

Render$1.prototype.findDeletedPlayer = function findDeletedPlayer (id) {
  var leftPlayer = this.getPlayer(id);
  this.stage.removeChild(leftPlayer);
};

Render$1.prototype.addPlayer = function addPlayer (player) {
  var PlayerModel = new PIXI.Container();
  var PlayerWorm = new Player(player);
  var PlayerWeapon = new Weapon(player);
  PlayerModel.pos = player.value.pos;
  PlayerModel.x = player.value.x;
  PlayerModel.x = player.value.y;
  PlayerModel.addChild(PlayerWorm);
  PlayerModel.addChild(PlayerWeapon);
  PlayerModel.id = player.key;
  PlayerModel.zOrder = 5;
  this.stage.addChild(PlayerModel);
};

Render$1.prototype.addBackground = function addBackground (config) {
  var backgroundIMG = new PIXI.Sprite(
    PIXI.loader.resources['background'].texture
  );
  backgroundIMG.width = window.innerWidth;
  backgroundIMG.height = window.innerHeight;
  this.background.addChild(backgroundIMG);
};

Render$1.prototype.loadResources = function loadResources (resources) {
  resources.forEach(function (resource) {
    PIXI.loader.add(resource.key, resource.src);
  });
};

Render$1.prototype.run = function run () {
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
  currentPlayer.position[1] = player.value.y;
  currentPlayer.weapon = player.value.weapon;
  currentPlayer.pos = player.value.pos;
  return {
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
  var row = 0;
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
};

Gamefield$$1.prototype.update = function update (data) {
    var this$1 = this;

  data.forEach(function (player) {
    var playerData = this$1.renderer.getPlayer(player.key);
    if (!playerData) {
      // Server sends more players, than client has online
      this$1.addPlayer(player);
    } else {
      //Player has turned
      if (player.value.pos !== playerData.pos) {
        this$1.actions.playerTurn(playerData, player.value);
      }
      playerData.pos = player.value.pos;
      //update renderer stats based on server values
      var physicsPos = this$1.physics.updatePosition(player);
      playerData.position.x = physicsPos.x;
      playerData.position.y = physicsPos.y;
      playerData.children[1].rotation = physicsPos.weapon.rotation;
    }
    if (player.value.shot) {
      this$1.actions.shoot(JSON.parse(player.value.shot));
    }
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

Gamefield$$1.prototype.initialize = function initialize (data) {
    var this$1 = this;

  return new Promise(function (resolve) {
    this$1.player = data.currentPlayer;
    PIXI.loader.load(function () {
      data.payload.forEach(function (player) {
        this$1.addPlayer(player);
      });
      this$1.renderer.addBackground();
      loadModels(data.currentMap, this$1.renderer.stage, this$1.physics);
      this$1.renderer.run();
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
    worm.scale.x = 1;
    gun.scale.x = 1;
    gun.x = -5;
  } else if (values.pos === 'R') {
    worm.scale.x = -1;
    gun.scale.x = -1;
    gun.x = 5;
  }
};

var renderConfig = {
  width: window.innerWidth,
  height: window.innerHeight - 10
};

var renderer = new Render$1(renderConfig);
var physics = new Physics();

var gamefield = new Gamefield$$1(renderer, physics);
var key = renderer.keys.keymap;

var timeouts = {
  jump: { value: false, time: 1500 },
  shoot: { value: false, time: 200 }
};

var Game = function Game(socket, player) {
  this.socket = socket;
  this.handleConnection();
};

Game.prototype.handleConnection = function handleConnection () {
  this.socket.connection.onmessage = function (data) {
    var response = JSON.parse(data.data);
    switch (response.type) {
      case "init":
        var resources = [
          { key: "skin", src: response.currentSkin.objects },
          { key: "background", src: response.currentMap.background },
          { key: "mapObjects", src: response.currentMap.objects },
          { key: "tiles", src: response.currentMap.tiles }
        ];
        physics.setPolygon("worm", response.currentSkin.polygon);
        renderer.stage.width = response.width;
        renderer.stage.height = response.height;
        renderer.loadResources(resources);

        gamefield.initialize(response).then(function () {
          socket.send({
            type: "ready"
          });
        });
        break;
      case "update":
        gamefield.update(response.payload);
        break;
      case "disconnect":
        renderer.findDeletedPlayer(response.payload);
        break;
    }
  };
};

Game.prototype.addPlayerToServer = function addPlayerToServer (player, server) {
  this.socket.send({
    type: "addPlayer",
    player: player,
    serverId: server
  });
};

Game.prototype.startServer = function startServer (server) {
  this.socket.send({
    type: "startServer",
    server: server
  });
};

var animations = function (currentPlayer) {
  var stats = {
    player: gamefield.player,
    y: currentPlayer.position[1],
    x: currentPlayer.position[0],
    pos: currentPlayer.pos,
    weapon: {
      rotation: currentPlayer.weapon.rotation
    },
    shot: null
  };

  renderer.keys.on(key.W, function () {
    if (!timeouts.jump.value) {
      currentPlayer.velocity[1] = -70;
      if (stats.pos === "R") {
        currentPlayer.velocity[0] = 10;
      } else {
        currentPlayer.velocity[0] = -10;
      }
      timeouts.jump.value = true;
      setTimeout(
        function () {
          timeouts.jump.value = false;
        },
        timeouts.jump.time
      );
    }
  });

  renderer.keys.on(key.A, function () {
    stats.x -= 3;
    stats.pos = "L";
  });

  renderer.keys.on(key.D, function () {
    stats.x += 3;
    stats.pos = "R";
  });

  renderer.keys.on(key.UP, function () {
    if (stats.pos === "R") {
      stats.weapon.rotation -= 0.1;
    } else {
      stats.weapon.rotation += 0.1;
    }
  });

  renderer.keys.on(key.DOWN, function () {
    if (stats.pos === "R") {
      stats.weapon.rotation += 0.1;
    } else {
      stats.weapon.rotation -= 0.1;
    }
  });

  renderer.keys.on(key.SHIFT, function () {
    if (!timeouts.shoot.value) {
      stats.shot = JSON.stringify(stats);
      timeouts.shoot.value = true;
      setTimeout(
        function () {
          timeouts.shoot.value = false;
        },
        timeouts.shoot.time
      );
    }
  });

  socket.send({
    type: "update",
    stats: stats
  });
};

PIXI.ticker.shared.add(function () {
  var model = physics.getModel(gamefield.player);
  physics.container.step(1 / 5);
  if (model) {
    renderer.stage.pivot.x = model.position[0] - window.innerWidth / 2;
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
});

var socketConfig = {
  url: "ws://localhost:3000"
};

var UX = (function (Component$$1) {
  function UX() {
    var this$1 = this;

    Component$$1.call(this);
    this.socket = new Socket(socketConfig);
    this.player = "player" + (Math.floor(Math.random() * ( 5 - 1 + 1) + 100));
    this.game = new Game(this.socket, this.player);
    this.state = { servers: [] };

    this.socket.connection.onmessage = function (data) {
      var response = JSON.parse(data.data);
      if (response.type === "serversInfo") {
        this$1.setState({ servers: response.payload });
      }
    };
  }

  if ( Component$$1 ) UX.__proto__ = Component$$1;
  UX.prototype = Object.create( Component$$1 && Component$$1.prototype );
  UX.prototype.constructor = UX;

  UX.prototype.joinServer = function joinServer (data) {
    this.game.addPlayerToServer(this.player, data);
  };

  UX.prototype.render = function render$$1 () {
    var this$1 = this;

    return (
      h( 'div', { id: "server-list" },
        this.state.servers.map(function (server) {
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

  return UX;
}(Component));

var Login = (function (Component$$1) {
  function Login() {
    Component$$1.call(this);
  }

  if ( Component$$1 ) Login.__proto__ = Component$$1;
  Login.prototype = Object.create( Component$$1 && Component$$1.prototype );
  Login.prototype.constructor = Login;

  Login.prototype.render = function render$$1 () {
    return (
      h( 'div', { id: "login-page" },
          h( 'h2', null, "Login" )
      )
    );
  };

  return Login;
}(Component));

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
          h( UX, { path: "/servers" })
        )
      )
    );
  };

  return Routes;
}(Component));

render(h( Routes, null ), document.getElementById("UX"));

}());
