# general development related configs

# activate rtx
type -q rtx; and rtx activate fish | source

# golang
set -gx GOPATH $HOME/go

# disable SAM CLI telemetry
set -gx SAM_CLI_TELEMETRY 0

# pipx config
type -q rtx; and set -gx PIPX_DEFAULT_PYTHON (rtx where python)/bin/python
set -gx USE_EMOJI true

# require virtualenv for pip
# to install to non-venv, use 'PIP_REQUIRE_VIRTUALENV="" pip install ...'
set -gx PIP_REQUIRE_VIRTUALENV true

# use TOML for rtx configuration
set -gx RTX_USE_TOML 1
