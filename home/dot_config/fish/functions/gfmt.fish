function gfmt --description "runs gofmt and goimports on all .go files except for ./vendor direcotry"
	if command -q gofmt
		echo "Running gofmt"
		gofmt -l -s -w (find . -type f -name '*.go' -not -path './vendor/*')
	else
		echo "gofmt not found"; and return 1
	end

	if command -q goimports
		echo "Running goimports"
		goimports -l -w (find . -type f -name '*.go' -not -path './vendor/*')
	else
		# not failing command if goimports is not found, since at least gofmt
		# is executed. Also, goimports is 3rd party tool, while gofmt comes
		# with go installation, so goimports does not have to be there, but
		# gofmt should
		echo "goimports not found, skipping"
	end
end