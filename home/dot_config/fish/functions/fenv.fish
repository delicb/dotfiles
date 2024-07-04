function fenv --description "print value of selected environment variable"
	if not type -q fzf; 
		echo "fzf not installed"
		return 1
	end

	set -l var (
		printenv | 
		cut -d= -f1 | 
		fzf --ignore-case \
			--height=25% \
			--cycle \
			--preview='printenv {}' \
			--preview-window='right:70%,wrap' \
			--padding 1 \
			--preview-label 'Env var value: {}'
	)

	printenv $var
end
