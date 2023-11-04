function which --description "fish-aware which"
	if functions --query $argv
		functions $argv
	else if abbr --query $argv
		abbr --show | command grep "abbr -a -g -- $argv "
	else
		command which $argv
	end
end
