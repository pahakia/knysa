#!/bin/bash -x

if [ $# -lt 1 ] ; then
    echo "Usage: $0 knysa-script.kns ..."
    exit
fi
knysa_sh=$0;
base_dir=$(dirname $knysa_sh)
echo $base_dir
js_script=$1;
cp $base_dir/knysa.js $(dirname $js_script)/
cp $base_dir/clientutils.js $(dirname $js_script)/
phantomjs $base_dir/run-knycon.js $js_script > $js_script.js

if [ $? -ne 0 ]; then
    echo 'Error happened:'
    cat $js_script.js
    rm $js_script.js
    exit
fi
shift
phantomjs --ssl-protocol=any $js_script.js $@
