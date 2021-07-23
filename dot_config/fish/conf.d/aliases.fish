    # fish does not really have aliases, but alias function that generates
    # other functions and marks them as wrapper for original commands (so that
    # completions will work)
    alias l="exa -lb --git --color-scale"
    alias g="git"
    alias gss="git status"