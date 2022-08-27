function cat --wraps=bat --description "Replaces cat with bat, except for markdown, where it uses mdcat"
	if string match --quiet '*.md' $argv && command --query mdcat
		mdcat $argv
		return
	end
	command bat $argv
end
