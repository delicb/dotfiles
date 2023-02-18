# instead of running `brew shellenv`, which sometimes adds duplicate entries, set values manually
if test -e /opt/homebrew/bin
	# brew specific variables
	set -gx HOMEBREW_PREFIX /opt/homebrew
	set -gx HOMEBREW_CELLAR /opt/homebrew/Cellar
	set -gx HOMEBREW_REPOSITORY /opt/homebrew

	set -q MANPATH; or set MANPATH ''
	set -q INFOPATH; or set INFOPATH ''
	if not contains "/opt/homebrew/share/man" $MANPATH
		set -gx MANPATH "/opt/homebrew/share/man" $MANPATH
	end
	if not contains "/opt/homebrew/share/info" $INFOPATH
		set -gx INFOPATH "/opt/homebrew/share/info" $INFOPATH
	end

	# disable homebrew analytics
	set -gx HOMEBREW_NO_ANALYTICS 1
	set -gx HOMEBREW_NO_GOOGLE_ANALYTICS 1

	fish_add_path -P /opt/homebrew/bin /opt/homebrew/sbin

	set -gx HOMEBREW_BAT true
end
