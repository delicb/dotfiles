function gcover --description "runs to tests with coverage and shows coverage in browser"
	set -l t "/tmp/go-cover.$fish_pid.tmp"
	go test -coverprofile=$t $argv; and go tool cover -html=$t; and unlink $t
end