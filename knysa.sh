#!/bin/bash

if [ $# -lt 1 ] ; then
    echo "Usage: $0 knysa-script.kns ..."
    exit
fi
knysa_sh=$0;
base_dir=$(dirname $knysa_sh)
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
if [ $# -eq 0 ]; then
  phantomjs --web-security=no --ssl-protocol=any $js_script.js
fi
if [ $# -eq 1 ]; then
  phantomjs --web-security=no --ssl-protocol=any $js_script.js "$1"
fi
if [ $# -eq 2 ]; then
  phantomjs --web-security=no --ssl-protocol=any $js_script.js "$1" "$2"
fi
if [ $# -eq 3 ]; then
  phantomjs --web-security=no --ssl-protocol=any $js_script.js "$1" "$2" "$3"
fi
if [ $# -eq 4 ]; then
  phantomjs --web-security=no --ssl-protocol=any $js_script.js "$1" "$2" "$3" "$4"
fi
if [ $# -eq 5 ]; then
  phantomjs --web-security=no --ssl-protocol=any $js_script.js "$1" "$2" "$3" "$4" "$5"
fi
if [ $# -eq 6 ]; then
  phantomjs --web-security=no --ssl-protocol=any $js_script.js "$1" "$2" "$3" "$4" "$5" "$6"
fi
if [ $# -eq 7 ]; then
  phantomjs --web-security=no --ssl-protocol=any $js_script.js "$1" "$2" "$3" "$4" "$5" "$6" "$7"
fi
if [ $# -eq 8 ]; then
  phantomjs --web-security=no --ssl-protocol=any $js_script.js "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8"
fi
if [ $# -eq 9 ]; then
  phantomjs --web-security=no --ssl-protocol=any $js_script.js "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8" "$9"
fi
