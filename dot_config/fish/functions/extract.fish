function extract --description "Extract various archive files"
	if not count $argv
		echo "file(s) not provided"; and return 1
	end

	for file in $argv
		if not stat $file &> /dev/null
			echo "file not found: $file"; and return 1
		end

		switch $file
			case "*.tar.bz2"
				tar -jxvf $file
			case "*.tar.gz"
				tar -zxvf $file
			case "*.bz2"
				bunzip2 $file
			case "*.dmg"
				hdiutil mount $file
			case "*.gz"
				gunzip $file
			case "*.tar"
				tar -xvf $file
			case "*.tbz2"
				tar -jxvf $file
			case "*.tgz"
				tar -zxvf $file
			case "*.zip"
				unzip $file
			case "*.ZIP"
				unzip $file
			case "*.whl"
				unzip $file
			case "*.pax"
				cat $file | pax -r
			case "*.pax.Z"
				uncompress $file --stdout | pax -r
			case "*.Z"
				uncompress $file
			case "*"
				# error for any other format
				echo "unsupported file for extraction file: $file"; and return 1
		end
	end
end