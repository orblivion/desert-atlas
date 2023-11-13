#!/bin/python3
import os, time

build_name = str(time.time())
open(os.path.join("output", "build_name"), "w").write(build_name)
print ("Build name set to", build_name)
