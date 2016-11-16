var fs = require('fs');
var path = require('path');

module.exports = function (template) {

  var cacheStore = template.cache;
  var defaults = template.defaults;
  var rExtname;

  // 提供新的配置字段
  defaults.base = '';
  defaults.extname = '.html';
  defaults.encoding = 'utf-8';

  const layoutReg = /{{ *layout *['"./-_a-zA-Z0-9]+? *}}/g;
	/**
	 * 处理模板内容，Layout
	 */
  function processLayout(source, filename) {
    let matchedLayoutItems = source.match(layoutReg) || [];
    if (matchedLayoutItems.length < 1) {
      return source;
    } else if (matchedLayoutItems.length > 1) {
      console.error('Multi layout config.');
      return source;
    }
    // 先干掉layout标记
    source = source.replace(layoutReg, '');
    // 读取Layout文件，然后把source内容嵌入到Layout页面中
    let dirname = path.dirname(filename + defaults.extname);
    let layoutPath = matchedLayoutItems[0].replace(/{{ *layout *['"]/, '').replace(/['"] *}}/, '');
    let layoutFilePath = path.join(dirname, layoutPath + '.html');
    let layoutContent = fs.readFileSync(layoutFilePath, defaults.encoding);
    // 处理section
    layoutContent = layoutContent.replace(/{{renderSection ['"a-zA-Z0-9]+?}}/g, (matchStr, index, str) => {
      let sectionName = matchStr.replace(/{{renderSection ['"]/, '').replace(/['"]}}/, '');
      let reg = new RegExp(`{{section ['"]${sectionName}['"]}}(\\w|\\W)+?{{\\/section}}`, 'g');
      let section = source.match(reg);
      if (!section) {
        return '';
      }
      let sectionText = section[0].replace(/{{section ['"a-zA-Z0-9]+?}}/g, '').replace(/{{\/section}}/g, '').replace(/\r|\n/g, '');
      return sectionText;
    });
    // 将partial内容装入layout页面
    source = layoutContent.replace(/{{ *renderBody *}}/, source);
    return source;
  }

  function compileFromFS(filename) {
    // 加载模板并编译
    var source = readTemplate(filename);

    if (typeof source === 'string') {
      // 处理Layout Update By Jay at 2016-11-15 14:09:13
      source = processLayout(source, filename);
      return template.compile(source, {
        filename: filename
      });
    }
  }

  // 重写引擎编译结果获取方法
  template.get = function (filename) {

    var fn;


    if (cacheStore.hasOwnProperty(filename)) {
      // 使用内存缓存
      fn = cacheStore[filename];
    } else {
      fn = compileFromFS(filename);

      if (fn) {
        var watcher = fs.watch(filename + defaults.extname);

        // 文件发生改变，重新生成缓存
        // TODO： 观察删除文件，或者其他使文件发生变化的改动
        watcher.on('change', function (event) {
          if (event === 'change') {
            cacheStore[filename] = compileFromFS(filename);
          }
        });
      }
    }

    return fn;
  };


  function readTemplate(id) {
    id = path.join(defaults.base, id + defaults.extname);

    if (id.indexOf(defaults.base) !== 0) {
      // 安全限制：禁止超出模板目录之外调用文件
      throw new Error('"' + id + '" is not in the template directory');
    } else {
      try {
        return fs.readFileSync(id, defaults.encoding);
      } catch (e) { }
    }
  }


  // 重写模板`include``语句实现方法，转换模板为绝对路径
  template.utils.$include = function (filename, data, from) {

    from = path.dirname(from);
    filename = path.join(from, filename);

    return template.renderFile(filename, data);
  }


  // express support
  template.__express = function (file, options, fn) {

    if (typeof options === 'function') {
      fn = options;
      options = {};
    }


    if (!rExtname) {
      // 去掉 express 传入的路径
      rExtname = new RegExp((defaults.extname + '$').replace(/\./g, '\\.'));
    }


    file = file.replace(rExtname, '');

    options.filename = file;
    fn(null, template.renderFile(file, options));
  };


  return template;
}