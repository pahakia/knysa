/***************************************************************************
The MIT License (MIT)

Copyright (c) 2016 Bo Zou (boxzou@yahoo.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*****************************************************************************/

var system = require('system');
var fs = require('fs');
var uglify = require("./UglifyJS/uglify-js.js");
var parser = uglify.parser;

function knycon() {
    var path;
    var base;
    var seq = 10000;
    var scopes = [[]];
    var curr_stats = [];
    var stat_index = 50001;
    var beginning = true;
    this.setPath = function setPath(p) {
        path = p;
        base = p;
        var pos = path.lastIndexOf('/');
        if (pos >= 0) {
            base = path.substring(pos + 1);
        }
        pos = base.indexOf('.');
        if (pos >= 0) {
            base = base.substring(0, pos);
        }
        base = 'knycon_' + base + '_';
    }
    this.getBase = function getBase() {
        return base;
    }
    this.getPath = function getPath() {
        return path;
    }
    this.nextSeq = function nextSeq() {
        seq++;
        return seq;
    }
    this.push = function push() {
        scopes.push([stat_index]);
        return this.topScope();
    }
    this.topScope = function topScope() {
        return scopes[scopes.length - 1];
    }
    this.pushVarName = function pushVarName(varName) {
        return topScope().push(varName);
    }
    this.flush = function flush(body, async) {
        if (curr_stats.length == 0) {
            return;
        }
        stat_index++;
        var name = 'n' + stat_index;
        if (async) name += '_async';
        var funcBody = [];
        for (var i = 0; i < curr_stats.length; i++) {
            var st = curr_stats[i];
            funcBody.push(st);
        }
        var st_func = ast_assignment(ast_dot('this', name), ast_function(null, funcBody, 'kflow'));
        body.push(st_func);
        curr_stats = [];
    }
this.convert = function convert(path) {
    this.setPath(path);
    var base = this.getBase();
    var fcontent = fs.read(path, "utf8");
    var ast = parser.parse(fcontent);
    //console.log('ast type: ' + ast[0]);
    var statements = [];
    var ret = ['toplevel', statements];
    var knysaReq = ast_var('knysa', ast_call('require', ast_str('./knysa.js')));
    statements.push(knysaReq);
    
    var body = [];
    var method = base + this.nextSeq();
    var flowFunc = ast_def_func(method, body);
    statements.push(flowFunc);
    
    var flowCall = ast_stat(ast_obj_call('knysa', 'knysa_exec', ast_new_func(method)));
    statements.push(flowCall);
    var orig_stats = ast[1];
    this.convertHelper(body, orig_stats);
    
    stat_index++;
    var exitName = 'n' + stat_index;
    var phantomExit = ast_stat(ast_obj_call('phantom', 'exit'));
    var exitFunc = ast_assignment(ast_dot('this', exitName), ast_function(null, [phantomExit]));
    body.push(ast_stat(exitFunc));

    //console.log('program ' + JSON.stringify(ret));
    var code = uglify.uglify.gen_code(ret, {beautify:true,indent_level: 4});
    return code;
}
this.convertHelper = function convertHelper(body, orig_stats) {
    for (var i = 0; i < orig_stats.length; i++) {
        //console.log('var i = ' + i);
        var stmt = orig_stats[i];
        if (ast_is_var(stmt)) {
            if (beginning) {
                body.push(stmt);
            } else {
                throw new Error('var must be declared at the beginning: ' + JSON.stringify(stmt));
            }
            continue;
        }
        beginning = false;
        if (ast_is_stat(stmt)) {
            if (ast_is_assign(stmt[1])) {
                var rh = stmt[1][3];
                if (ast_is_async(rh)) {
                    var callbackName = 'callback_' + stat_index;
                    var retVarStmt = ast_assignment(ast_dot('kflow', 'retCallback'), ast_dot('this', callbackName));
                    curr_stats.push(ast_stat(retVarStmt));
                    curr_stats.push(ast_stat(rh));
                    this.flush(body, true);
                    var tmpVar = 'tmp_' + stat_index;
                    var as1 = ast_assignment(stmt[1][2], ast_arg(tmpVar));
                    var retVarFunc = ast_assignment(ast_dot('this', callbackName), ast_function(null, [as1], tmpVar));
                    body.push(ast_stat(retVarFunc));
                } else {
                    curr_stats.push(stmt);
                }
            } else if (ast_is_call(stmt[1])) {
                var rh = stmt[1];
                // if 'kflow.sleep()'
                // ["stat",["call",["dot",["name","kflow"],"sleep"],[["name","n"]]]]
                var name = rh[1];
                if (name[0] == 'dot' && name[1][0] == 'name' && name[1][1] == 'kflow' && name[2] == 'sleep') {
                    this.flush(body);
                    stat_index++;
                    var sleepName = 'n' + stat_index + "_sleep";
                    var as1 = ast_return(rh[2][0]);
                    var sleepFunc = ast_assignment(ast_dot('this', sleepName), ast_function(null, [as1]));
                    body.push(ast_stat(sleepFunc));
                    continue;
                }
                if (ast_is_async(rh)) {
                    curr_stats.push(stmt);
                    this.flush(body, true);
                } else {
                    curr_stats.push(stmt);
                }
            } else {
                curr_stats.push(stmt);
                //throw new Error('unsupported stat: ' + JSON.stringify(stmt));
            }
        } else if (ast_is_if(stmt)) {
            this.flush(body);
            var expr = stmt[1];
            var ifBlock = stmt[2];
            var elseBlock = stmt[3];
            stat_index++;
            var ifName = 'n' + stat_index + "_if";
            var as1 = ast_return(expr);
            var ifFunc = ast_assignment(ast_dot('this', ifName), ast_function(null, [as1], 'kflow'));
            body.push(ast_stat(ifFunc));
            this.convertHelper(body, ifBlock[1]);
            if (elseBlock != null) {
                stat_index++;
                var endElseName = 'n' + stat_index + "_else_" + ifName;
                var endElseFunc = ast_assignment(ast_dot('this', endElseName), ast_function(null, []));
                body.push(ast_stat(endElseFunc));
                this.convertHelper(body, elseBlock[1]);
            }
            stat_index++;
            var endIfName = 'n' + stat_index + "_endif_" + ifName;
            var endIfFunc = ast_assignment(ast_dot('this', endIfName), ast_function(null, []));
            body.push(ast_stat(endIfFunc));
        } else if (ast_is_while(stmt)) {
            this.flush(body);
            var expr = stmt[1];
            var whileBlock = stmt[2];
            stat_index++;
            var whileName = 'n' + stat_index + "_while";
            var as1 = ast_return(expr);
            var whileFunc = ast_assignment(ast_dot('this', whileName), ast_function(null, [as1], 'kflow'));
            body.push(ast_stat(whileFunc));
            this.convertHelper(body, whileBlock[1]);
            stat_index++;
            var endWhileName = 'n' + stat_index + "_endwhile_" + whileName;
            var endWhileFunc = ast_assignment(ast_dot('this', endWhileName), ast_function(null, []));
            body.push(ast_stat(endWhileFunc));
        } else if (ast_is_block(stmt)) {
        } else if (ast_is_try(stmt)) {
            this.flush(body);
            var tryBlock = stmt[1];
            var catchBlock = stmt[2];
            var finalBlock = stmt[3];
            stat_index++;
            var tryName = 'n' + stat_index + "_try";
            var tryFunc = ast_assignment(ast_dot('this', tryName), ast_function(null, []));
            body.push(ast_stat(tryFunc));
            this.convertHelper(body, tryBlock);
            if (catchBlock != null) {
                stat_index++;
                var catchVarName = catchBlock[0];
                var tmpCatchVarName = catchVarName + '_tmp';
                var catchName = 'n' + stat_index + "_catch_" + tryName;
                var as1 = ast_assignment(ast_arg(catchVarName), ast_arg(tmpCatchVarName));
                var catchFunc = ast_assignment(ast_dot('this', catchName), ast_function(null, [as1], tmpCatchVarName));
                body.push(ast_stat(catchFunc));
                body.unshift(ast_var(catchVarName));
                this.convertHelper(body, catchBlock[1]);
            }
            if (finalBlock != null) {
                stat_index++;
                var finalName = 'n' + stat_index + "_finally_" + tryName;
                var finalFunc = ast_assignment(ast_dot('this', finalName), ast_function(null, []));
                body.push(ast_stat(finalFunc));
                this.convertHelper(body, finalBlock);
            }
            stat_index++;
            var endTryName = 'n' + stat_index + "_endtry_" + tryName;
            var endTryFunc = ast_assignment(ast_dot('this', endTryName), ast_function(null, []));
            body.push(ast_stat(endTryFunc));
        } else if (ast_is_break(stmt)) {
            this.flush(body);
            stat_index++;
            var breakName = 'n' + stat_index + "_break";
            var breakFunc = ast_assignment(ast_dot('this', breakName), ast_function(null, []));
            body.push(ast_stat(breakFunc));
        } else if (ast_is_defun(stmt)) {
            this.flush(body);
            body.push(stmt);
        } else {
            curr_stats.push(stmt);
            //throw new Error('unsupported statement: ' + JSON.stringify(stmt));
        }
    }
    this.flush(body);
}

}
    // AST related
    function ast_var(name, stmt) {
        return ["var",[[name, stmt]]];
    }
    function ast_num(num) {
        return ["num", num];
    }
    function ast_str(str) {
        return ["string",str];
    }
    function ast_dot(obj, name) {
        return ["dot", ast_arg(obj), name];
    }
    function ast_assignment(name, stmt) {
        return ["assign",true,ast_arg(name),stmt];
    }
    function ast_return(arg) {
        return ["return", ast_arg(arg)];
    }
    function ast_obj_var(obj, name, stmt) {
        return ["assign",true,ast_dot(obj,name),stmt];
    }
    function ast_this_var(name, stmt) {
        return ast_obj_var('this', name, stmt);
    }
    function ast_arg(arg) {
        if (typeof(arg) == 'string') {
            return ["name",arg];
        } else {
            return arg;
        }
    }
    function ast_obj_call() {
        var args = Array.prototype.slice.call(arguments);
        //console.log('ast_obj_call ' + JSON.stringify(args));
        var obj = args[0];
        var name = args[1];
        var args2 = [];
        for (var i = 2; i < args.length; i++) {
            args2.push(ast_arg(args[i]));
        }
        return ["call",ast_dot(obj,name),args2];
    }
    function ast_func() {
        var args = Array.prototype.slice.call(arguments);
        //console.log('ast_func ' + JSON.stringify(args));
        var type = args[0];
        var name = args[1];
        var args2 = [];
        for (var i = 2; i < args.length; i++) {
            args2.push(ast_arg(args[i]));
        }
        return [type,ast_arg(name),args2];
    }
    function ast_call() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('call');
        return ast_func.apply(null, args);
    }
    function ast_new_func() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('new');
        return ast_func.apply(null, args);
    }
    function ast_def_func() {
        var args = Array.prototype.slice.call(arguments);
        var name = args[0];
        var body = args[1];
        var args2 = [];
        for (var i = 2; i < args.length; i++) {
            args2.push(args[i]);
        }
        return ["defun",name,args2,body];
    }
    function ast_function() {
        var args = Array.prototype.slice.call(arguments);
        var name = args[0];
        var body = args[1];
        var args2 = [];
        for (var i = 2; i < args.length; i++) {
            args2.push(args[i]);
        }
        return ["function",name,args2,body];
    }
    function ast_stat(stmt) {
        return ["stat",stmt];
    }
    function ast_is_var(stmt) {
        return stmt[0] == 'var';
    }
    function ast_is_block(stmt) {
        return stmt[0] == 'block';
    }
    function ast_is_while(stmt) {
        return stmt[0] == 'while';
    }
    function ast_is_call(stmt) {
        return stmt[0] == 'call';
    }
    function ast_is_assign(stmt) {
        return stmt[0] == 'assign';
    }
    function ast_is_stat(stmt) {
        return stmt[0] == 'stat';
    }
    function ast_is_async(stmt) {
        if (!ast_is_call(stmt)) {
            return false;
        }
        var funcName = stmt[1][stmt[1].length - 1];
        return funcName.indexOf('knysa_') == 0;
    }
    function ast_is_if(stmt) {
        return stmt[0] == 'if';
    }
    function ast_is_while(stmt) {
        return stmt[0] == 'while';
    }
    function ast_is_try(stmt) {
        return stmt[0] == 'try';
    }
    function ast_is_break(stmt) {
        return stmt[0] == 'break';
    }
    function ast_is_defun(stmt) {
        return stmt[0] == 'defun';
    }

knycon.prototype.test = function test(path) {
    this.setPath(path);
    var base = this.getBase();
    var fcontent = fs.read(path, "utf8");
    var ast = parser.parse(fcontent);
    console.log('ast type: ' + ast[0]);
    var statements = [];
    var ret = [ast[0], statements];
    var method = base + this.nextSeq();
    var s1 = ast_stat(ast_obj_var('this', 'var1', ast_str('hello'))); 
    var s2 = ast_stat(ast_obj_call('kflow', 'sleep', 'n','m')); 
    var s3 = ast_var('nnn', ast_num(1000));
    var s4 = ast_var('nnn2', ast_call('func1', 'abc', 'def'));
    var flowSleep = ast_def_func('sleep', [s1,s2,s3,s4], 'a1', 'a2');
    statements.push(flowSleep);
    //var s1 = ["defun",method,[],[["stat",["call",["dot",["name","kflow"],"sleep"],[["name","n"]]]]]];
    //statements.push(s1);
    //var sn = ["stat",["call",["dot",["name","knysa"],"exec"],[["new",["name", method],[]]]]];
    //statements.push(s2);
    var code = uglify.uglify.gen_code(ret);
    console.log(code);
}

module.exports = new knycon();
