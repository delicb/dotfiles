#####################################################################
# Relevant only for interactive use
#####################################################################

if status is-interactive
    # initialize asdf, if installed
    if test -e $HOME/.asdf/asdf.fish
        source $HOME/.asdf/asdf.fish
    end

	# initialize prompt
	starship init fish | source

	# initialize jump
	jump shell fish | source

	# run script with porentially private config
	if test -e $HOME/.private.config.fish
		source $HOME/.private.config.fish
	end
end

##########################################################################
# Development configuration variables
# This config assumest that the followind packages are installed via brew
# - xz
# - openssl
# - libpq
##########################################################################
# for installing python via pyenv or asdf, lzma is (optionally) needed
# so add path to CPPFLAGS
set -gx CPPFLAGS "-I$HOMEBREW_PREFIX/xz/include"

# for building various tools, ssl is needed
set -gx LDFLAGS "-I$HOMEBREW_PREFIX/opt/openssl@1.1/include -L$HOMEBREW_PREFIX/opt/openssl@1.1/lib -I$HOMEBREW_PREFIX/opt/libffi/include -L$HOMEBREW_PREFIX/opt/libffi/lib"

# for installing python libs like psycopg2, update path to point to bin
# folder of libpq brew package (needed for pg_conf)
fish_add_path --path --move --append $HOMEBREW_PREFIX/opt/libpq/bin
