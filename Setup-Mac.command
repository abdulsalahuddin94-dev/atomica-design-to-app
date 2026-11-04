#!/bin/bash
# Double-click to install everything this workflow needs on a Mac (Node.js, Python 3, Git, Figma Desktop).
# Keep in sync with tools/dependencies.json (darwin install commands).
cd "$(dirname "$0")" || exit 1
echo ""
echo "Atomica Studio - machine setup"
echo ""

if ! command -v brew >/dev/null 2>&1; then
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
fi
if ! command -v brew >/dev/null 2>&1; then
  echo "Installing Homebrew (the Mac installer for developer tools). It asks for your Mac password and to press Return."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
fi
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew could not be installed. Install the tools from: https://nodejs.org  https://www.python.org/downloads/  https://www.figma.com/downloads/"
  read -r -p "Press Return to close"; exit 1
fi

node_ok() { v=$(node --version 2>/dev/null) && [ "$(echo "$v" | sed 's/^v//; s/\..*//')" -ge 18 ]; }
python_ok() { python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' >/dev/null 2>&1; }
git_ok() { git --version >/dev/null 2>&1; }
figma_ok() { [ -d /Applications/Figma.app ] || [ -d "$HOME/Applications/Figma.app" ]; }

node_ok   && echo "  OK  Node.js"       || { echo "Installing Node.js...";       brew install node; }
python_ok && echo "  OK  Python 3"      || { echo "Installing Python 3...";      brew install python; }
git_ok    && echo "  OK  Git"           || { echo "Installing Git...";           brew install git; }
figma_ok  && echo "  OK  Figma Desktop" || { echo "Installing Figma Desktop..."; brew install --cask figma; }

echo ""
missing=""
node_ok || missing="$missing Node.js"; python_ok || missing="$missing Python3"; git_ok || missing="$missing Git"; figma_ok || missing="$missing Figma"
if [ -z "$missing" ]; then
  echo "Done. Open Claude Code in this folder (close it first if it was open) and start."
else
  echo "Still missing:$missing. Open Claude Code in this folder and Claude will help."
fi
read -r -p "Press Return to close"
