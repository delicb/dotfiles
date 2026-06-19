# add some personal paths, ensure they are among the first in $PATH
fish_add_path --path --prepend --move $HOME/.local/bin $HOME/go/bin $HOME/bin

# ensure system paths are there and that they are at the end
if test -e /etc/paths
	fish_add_path --path --move --append (cat /etc/paths)  # this basically simulates /usr/libexec/path_helper
else
	# if there is no /etc/paths, hardcode some common paths
	fish_add_path --path --move --append /usr/local/bin /usr/bin /bin /usr/sbin /sbin
end

# linear needs pg_dump 18.3
fish_add_path --prepend (brew --prefix "$tap/libpq@18.3")/bin