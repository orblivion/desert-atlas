#!/bin/python3
import os, time

open(os.path.join("output", "build_name"), "w").write(str(time.time()))
