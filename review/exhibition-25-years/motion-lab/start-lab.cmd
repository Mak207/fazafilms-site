@echo off
pushd "%~dp0..\..\.."
echo Open http://127.0.0.1:8766/review/exhibition-25-years/motion-lab/
py -3 -m http.server 8766 --bind 127.0.0.1
popd
