# set language variables
set -gx LANG "en_US.UTF-8"
set -gx LANGUAGE "en_US.UTF-8"
set -gx LC_ALL "en_US.UTF-8"

# common variables
set -gx EDITOR "vim"
set -gx PAGER "less"
set -gx LESS "--RAW-CONTROL-CHARS --quit-if-one-screen"

# golang
set -gx GOPATH $HOME/go

# disable SAM CLI telemetry
set -gx SAM_CLI_TELEMETRY 0

# delate pager, for page-up-down to work in VSCode (since delta is not respecting $LESS variable)
set -gx DELTA_PAGER "less --RAW-CONTROL-CHARS --quit-if-one-screen"

# set ripgrep config file
set -gx RIPGREP_CONFIG_PATH "$HOME/.ripgreprc"

# pipx config
set -gx PIPX_DEFAULT_PYTHON (rtx where python)/bin/python
set -gx USE_EMOJI true

# require virtualenv for pip
# to install to non-venv, use 'PIP_REQUIRE_VIRTUALENV="" pip install ...'
set -gx PIP_REQUIRE_VIRTUALENV true 
