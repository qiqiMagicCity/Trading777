#!/usr/bin/env bash
set -e
npm ci
npm run test -w web -- tests/m5.trace.golden.spec.ts && exit 0 || exit 1
