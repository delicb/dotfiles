function set_clipboard --description "sets clipboard to provided argument value"
	set val (string join " " $argv)
	if type -q pbcopy
		printf '%s' $val | pbcopy
	else if set -q WAYLAND_DISPLAY; and type -q wl-copy
		printf '%s' $val | wl-copy
	else if set -q DISPLAY; and type -q xsel
		printf '%s' $val | xsel --clipboard
	else if set -q DISPLAY; and type -q xclip
		printf '%s' $val | xclip -selection clipboard
	else if type -q clip.exe
		printf '%s' $val | clip.exe
	end
end
