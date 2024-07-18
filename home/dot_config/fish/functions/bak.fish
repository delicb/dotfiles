function bak --description "Create backup version of file with .bak extension"
	set -l filename $argv[1]
	mv $filename $filename".bak"
end
