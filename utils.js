var utils = {
    //http://stackoverflow.com/a/15344767
    isset: function(obj) {
        var a=arguments, b=utils.isset; // replace a.callee by the function name you choose because callee is depreceate, in this case : get_if_exist
        // version 1 calling the version 2
        if(a[1] && ~a[1].indexOf('.')) 
            return b.apply(this,[obj].concat(a[1].split('.')));
        // version 2
        return a.length==1 ? a[0] : (obj[a[1]] && b.apply(this,[obj[a[1]]].concat([].slice.call(a,2))));
    }
}

module.exports = utils;