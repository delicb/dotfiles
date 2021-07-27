function aws_tail_logs --description "tails logs for specified log group"
	if not count $argv > /dev/null
		echo "no log group provided"; and return 1
	end

	aws logs tail $argv[1] --follow --since 6h --format=short
end