# knysa
Knysa is a javascript library that enables you to write phantomjs scripts in "sync" style, i.e. without callbacks.

## Target Audience
Developer who has experience with phantomjs and casperjs.

## Precondition
phantomjs must be installed and phantomjs command is available on PATH.

## Usage
```
Clone the repo and write your own knysa script (say my.kns) and you can then run the script:
   $PATH_TO_KNYSA_DIR/knysa.sh my.kns [additional args to my.kns]

Asynchronous function must be prefixed with 'knysa_' which informs knysa to suspend execution.
Such asynchronous function must resume the execution as follows:
1. outside browser (i.e. not in a knysa_evaluate function), do:
      kflow.resume(data);
   data will be assigned to ret in the following:
      var ret = knysa_my_func(kflow);
2. inside browser (i.e. in knysa_evaluate function), do:
      window.callPhantom({kflowId : kflowId, ... });
   kflowId is essential, it can be obtained by kflow.getId() and passed to the knysa_evaluate function.
   The data passed into callPhantom including kflowId will be assigned to ret in the following:
      var ret = kflow.knysa_evaluate(myFunc, kflow.getId()); 
```

## API
```
1. implicit variable: kflow
2. functions on kflow:
   asynchronous ones:
      a. knysa_open: execution will be resumed when page finishes loading.
      b. knysa_evaluate: same as synchronous version (sandboxed) except execution is suspended
         until window.callPhantom is called as in Usage above.
      c. sleep: milliseconds.  execution will be resumed after the sleep.
   synchronous ones:
      a. getID: return the kflow ID
      b. evaludate: phantomjs evaludate (sandboxed)
      c. render: phantomjs render
      d. exists, click, getHTML, fill, download: taken from casperjs
3. asynchronous statements (function calls prefixed with 'knysa_') are supported inside:
      a. try/catch/finally blocks
      b. if/else/while blocks
   they are NOT supported inside 'for' block.
4. asynchronous (knysa_) function calls must be on separate line, either
      knysa_my_func(...); or
      ret = knysa_my_func(...)
   object call is supported, i.e. myObj.knysa_my_func(...)
5. all variables must be declared at the beginning, including the variable err in catch(err).
```
## Unsupported
1. 'else if' is not supported.

## Examples
```
check out examples under examples directory. 
1. sleep.kns: kflow.sleep()
2. resume.kns: suspend and resume execution
3. opl.kns: knysa_open, knysa_evaluate, sleep, exists, click, getHTML, fill as well as flow
   constructs: while/if/else
4. try.kns: try/catch/finally and while/break and their mixture
```

