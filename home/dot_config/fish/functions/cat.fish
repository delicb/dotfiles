function cat --wraps=bat --description "Replaces cat with bat, except for markdown, where it uses mdcat"
	set -l flags
	set -l params
	for f in $argv
		if string match --quiet -- '-*' $f
			set -a flags $f
		else
			set -a params $f
		end
	end
	if string match --quiet '*.md' $params && command --query mdcat
		mdcat $flags $params
		return
	end
	if command --query bat
		command bat $flags $params
		return
	end
	command cat $flags $params
end
