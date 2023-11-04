function cdf --description "Change to directory opened in Finder"
	if [ -x /usr/bin/osascript ]
		set -l target (osascript -e 'tell application "Finder" to if (count of Finder windows) > 0 then get POSIX path of (target of front Finder window as text)')
		if [ "$target" != "" ]
			cd "$target"; pwd
		else
			echo "No finder window found" >&2
		end
	end
end
