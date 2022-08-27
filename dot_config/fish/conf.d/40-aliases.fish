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

# git aliases
abbr -a -g g git
abbr -a -g gc "git commit"
abbr -a -g ga "git add"
abbr -a -g gd "git diff"
abbr -a -g gf "git fetch"
abbr -a -g gp "git pull"
abbr -a -g gss "git s"
abbr -a -g gbd "git branch -d"
abbr -a -g gfpm "git switch (basename (git symbolic-ref --short refs/remotes/origin/HEAD)) && git fetch && git pull"

# k8s aliases
abbr -a -g k "kubectl"
abbr -a -g kc "kubectx"
abbr -a -g kn "kubens"

# reload config
abbr -a -g reload "exec fish"

# tailscale cli
if test -x /Applications/Tailscale.app/Contents/MacOS/Tailscale
	alias tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale
end

