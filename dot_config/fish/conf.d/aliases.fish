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
alias ldir "l -D"
function tree --wraps exa --description "alias tree exa"
	if count $argv > /dev/null
		set level $argv[1]
	else
		set level 2
	end
	exa --tree --level $level
end


# suffixes for common commands
alias cp "cp -i"
alias df "df -h"
alias du "du -sh"
alias cp "cp -i"
alias rm "rm -i"
alias cm "chezmoi"

# replace cat with bat
alias cat "bat"

# git aliases
alias g git
alias gc "git commit"
alias ga "git add"
alias gd "git diff"
alias gf "git fetch"
alias gp "git pull"
alias gss "git s"

# k8s aliases
alias k "kubectl"
alias kc "kubectx"
alias kn "kubens"

# reload config
alias reload "exec fish"

# tailscale cli
if test -x /Applications/Tailscale.app/Contents/MacOS/Tailscale
	alias tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale
end
