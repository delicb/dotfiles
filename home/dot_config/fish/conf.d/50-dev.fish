# general development related configs

# activate mise
type -q mise; and mise activate fish | source


set -gx MISE_USE_TOML 1  # use TOML for mise configuration
set -gx MISE_FISH_AUTO_ACTIVATE 0  # do not use vendor auto-activate, I activate manually

# golang
set -gx GOPATH $HOME/go

# disable SAM CLI telemetry
set -gx SAM_CLI_TELEMETRY 0

# pipx config
type -q mise; and set -gx PIPX_DEFAULT_PYTHON (mise where python)/bin/python
set -gx USE_EMOJI true

# require virtualenv for pip
# to install to non-venv, use 'PIP_REQUIRE_VIRTUALENV="" pip install ...'
set -gx PIP_REQUIRE_VIRTUALENV true

