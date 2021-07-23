# fish does not really have aliases, but alias function that generates
# other functions and marks them as wrapper for original commands (so that
# completions will work)

# common aliases
alias .. "cd .."
alias ... "cd ../.."
alias .... "cd ../../.."
alias ls exa
alias l "exa -lb --git --color-scale"
alias ll l
alias la "l -a"

# suffixes for common commands
alias cp "cp -i"
alias df "df -h"
alias du "du -sh"

# git aliases
alias g git
alias ga "git add"
alias gd "git diff"
alias gf "git fetch"
alias gp "git pull"
alias gss "git s"

# reload config
alias reload "exec $SHELL -l"
