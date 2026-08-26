#!/usr/bin/env sh
# Cross-compiles the Windows randomizer from Linux. See desktop/README.md.
#   apt-get install mingw-w64
#   desktop/build.sh
#
# -mwindows keeps the console window from appearing behind it, and the
# static flags fold libgcc in so the result is one file with nothing to
# install alongside it.
set -e

cd "$(dirname "$0")"
CC=${CC:-x86_64-w64-mingw32-gcc}
WINDRES=${WINDRES:-x86_64-w64-mingw32-windres}

# Straight into public/, so the site serves the same binary that is in the
# repo and there is only ever one copy of it.
OUT=../public
$WINDRES randomizer.rc -O coff -o randomizer.res
$CC randomizer.c randomizer.res \
    -o $OUT/PrefLopLab-Randomizer.exe \
    -O2 -municode -mwindows -static -static-libgcc \
    -Wall -Wextra \
    -lgdi32 -luser32 -ladvapi32
rm -f randomizer.res
"${STRIP:-x86_64-w64-mingw32-strip}" $OUT/PrefLopLab-Randomizer.exe

ls -la $OUT/PrefLopLab-Randomizer.exe
