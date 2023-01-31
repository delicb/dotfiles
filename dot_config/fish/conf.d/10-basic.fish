# set language variables
set -gx LANG "en_US.UTF-8"
set -gx LANGUAGE "en_US.UTF-8"
set -gx LC_ALL "en_US.UTF-8"

# common variables
set -gx EDITOR "vim"
set -gx PAGER "less"
set -gx LESS "--RAW-CONTROL-CHARS --quit-if-one-screen"


# delate pager, for page-up-down to work in VSCode (since delta is not respecting $LESS variable)
set -gx DELTA_PAGER "less --RAW-CONTROL-CHARS --quit-if-one-screen"

# set ripgrep config file
set -gx RIPGREP_CONFIG_PATH "$HOME/.ripgreprc"

