#!/bin/sh
# Bygger Rust-motorn till WebAssembly och lägger den där webbsidan hämtar den (docs/rust3d/rust3d.wasm).
set -e
cd "$(dirname "$0")"
rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
cargo test --release
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/rust3d.wasm ../docs/rust3d/rust3d.wasm
ls -la ../docs/rust3d/rust3d.wasm
