// 匹配 book in books
const forReg1 = /^\s*(\S+)\s*in\s*(\S+)\s*$/g;
// 匹配 (book, i) in books
const forReg2 = /^\s*\((\S+),\s*(\S+)\)\s*in\s*(\S+)\s*$/g;
// 匹配 {{name}} - {{age}}
const paramReg = /{{([^{}]+)}}/g;

function isElement(el) {
  return el.nodeType === 1;
}

function isText(el) {
  return el.nodeType === 3;
}

function getValue(expr, vm) {
  return eval('vm.$data.' + expr);
}

function getContent(expr, vm) {
  return expr.replace(paramReg, (r, $1) => {
    with (vm.$data) {
			return eval($1);
		}
  });
}

function forRender() {
  
}

// 指令处理
const directiveHander = {
  text(el, expr, vm) {
    new Watcher(vm, expr, newValue => {
      el.textContent = newValue;
    });
    el.textContent = getValue(expr, vm);
  },
  html(el, expr, vm) {
    new Watcher(vm, expr, newValue => {
      el.innerHTML = newValue;
    });
    el.innerHTML = getValue(expr, vm);;
  },
  model(el, expr, vm) {
    new Watcher(vm, expr, newValue => {
      el.value = newValue;
    });
    el.value = getValue(expr, vm);
  },
  for(el, expr, vm) {
    const parentEl = el.parentElement;
    el.removeAttribute('v-for');

    let forKey = null;
    let forIndex = null;
    let forValue = null;

    let forRegRet = forReg1.exec(expr);
    if (forRegRet) {
      forKey = forRegRet[1];
      forValue = forRegRet[2];
    } else {
      forRegRet = forReg2.exec(expr);
      if (forRegRet) {
        forKey = forRegRet[1];
        forIndex = forRegRet[2];
        forValue = forRegRet[3];
      }
    }

    if (forKey && forValue) {
      const list = getValue(forValue, vm);

      // 缓存第一个节点
      const cacheEl = el.cloneNode(true);
      let index = 0;
      list.forEach(item => {
        let cloneEl;
        if (index == 0) {
          // 第一个节点复用原来的第一个节点
          cloneEl = el;
        } else if (index === list.length - 1) {
          // 最后一个节点复用缓存的节点
          cloneEl = cacheEl
          parentEl.appendChild(cloneEl);
        } else {
          // 克隆节点
          cloneEl = cacheEl.cloneNode(true);
          parentEl.appendChild(cloneEl);
        }

        const forData = {};
        forData[forKey] = item;
        if (forIndex) {
          forData[forIndex] = index;
        }
        mapCompile([cloneEl], forData, vm.methods, vm);
        
        index ++;
      });
    }
  }
};

// 文本处理
function textHandle(el, vm) {
  if(!el.nodeValue.trim()) {
    return;
  }
  // 缓存expr，用于数据更新时重新生成value
  el['my-text'] = el.nodeValue;
  el.nodeValue = el.nodeValue.replace(paramReg, (r, $1) => {
    new Watcher(vm, $1, () => {
      el.nodeValue = getContent(el['my-text'], vm);
    });
    with (vm.$data) {
			return eval($1);
		}
  });
}

// 递归遍历节点
function mapCompile(childNodes, data, methods, vm) {
  function mapChildNodes(childNodes) {
    childNodes.forEach(child => {
      if (isElement(child)) {
        [...child.attributes].forEach(attr => {
          if (attr.name.startsWith('v-')) {
            let directive, eventName;
            [, directive] = attr.name.split('-');
            [directive, eventName] = directive.split(':');
            if (eventName) {
              child.addEventListener(eventName, e => {
                (methods[attr.value] && methods[attr.value].bind(vm))();
              });
            } else if (directive) {
              directiveHander[directive](child, attr.value, vm);
            }
          }
        })
  
        if (isElement(child) && child.childNodes.length) {
          mapChildNodes([...child.childNodes]);
        }
      } else if (isText(child)) {
        textHandle(child, vm)
      }
    })
  }
  mapChildNodes(childNodes);
}

class MyVue {
  constructor(options) {
    this.$el = options.el;
    this.$data = options.data || {};

    this.$methods = options.methods || {};

    if (this.$el) {
      this.proxyData(this.$data);

      new Observer(this.$data);

      this.compile(this.$el, this.$data, this.$methods);
    } else {
      throw new Error('el must be set !');
    }
  }

  proxyData(data) {
    Object.keys(data).forEach(key => {
      Object.defineProperty(this, key, {
        get() {
          return data[key];
        },
        set(newValue) {
          data[key] = newValue;
        }
      });
    })
  }

  compile(el, data, methods) {
    el = isElement(el) ? el : document.querySelector(el);

    const fragment = document.createDocumentFragment();

    let child;
    while(child = el.firstChild) {
      fragment.appendChild(child);
    }

    mapCompile([...fragment.childNodes], data, methods, this);

    el.appendChild(fragment);
  }
}

class Observer {
  constructor(data) {
    this.observe(data);
  }

  observe(data) {
    if (data && typeof data == 'object') {
      Object.keys(data).forEach(key => {
        if (typeof data[key] === 'object' && data[key].length) {
          this.observeArray(data[key]);
        } else {
          this.defineDirective(data, key, data[key]);
        }
      });
    }
  }

  defineDirective(data, key, value) {
    this.observe(value);
    const dep = new Dep();
    Object.defineProperty(data, key, {
      get() {
        Dep.target && dep.addSub(Dep.target);
        return value;
      },
      set: (newValue) => {
        if (value !== newValue) {
          this.observe(newValue);
          value = newValue;
          dep.notify();
        }
      }
    })
  }

  observeArray(array) {

  }
}

class Dep {
  constructor() {
    this.subs = [];
  }

  addSub(watcher) {
    this.subs.push(watcher);
  }

  notify() {
    this.subs.forEach(watcher => watcher.update())
  }
}

class Watcher {
  constructor(vm, expr, cb) {
    this.vm = vm;
    this.expr = expr;
    this.cb = cb;

    this.oldValue = this.get(expr, vm);
  }

  get(expr, vm) {
    Dep.target = this;
    const value = getValue(expr, vm);
    Dep.target = null;
    return value;
  }

  update() {
    const newValue = getValue(this.expr, this.vm);
    if (newValue !== this.oldValue) {
      this.cb(newValue);
    }
  }
}