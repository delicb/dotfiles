if status is-interactive
    # set fisher_path $HOME/.config/fish/plugins

    # set fish_complete_path $fish_complete_path[1] $fisher_path/completions $fish_complete_path[2..-1]
    # set fish_function_path $fish_function_path[1] $fisher_path/functions $fish_function_path[2..-1]

    # for file in $fisher_path/conf.d/*.fish
    #     source $file
    # end

    # instead of running `brew shellenv`, which sometimes addes duplicate entries, set values manually
    if test -e /opt/homebrew/bin/brew
        fish_add_path -P /opt/homebrew/bin /opt/homebrew/sbin
        # brew specific variables
        set -gx HOMEBREW_PREFIX /opt/homebrew
        set -gx HOMEBREW_CELLAR /opt/homebrew/HOMEBREW_CELLAR
        set -gx HOMEBREW_REPOSITORY /opt/homebrew
        set -q MANPATH; or set MANPATH ''
        set -q INFOPATH; or set INFOPATH ''
        if not contains "/opt/homebrew/share/man" $MANPATH
            set -gx MANPATH "/opt/homebrew/share/man"
        end
        if not contains "/opt/homebrew/share/info" $INFOPATH
            set -gx INFOPATH "/opt/homebrew/share/info"
        end
    end

    # initialize asdf, if installed
    if test -e $HOME/.asdf/asdf.fish
        source $HOME/.asdf/asdf.fish
    end

    # add some personal paths, ensure they are among the first in $PATH
    fish_add_path --path --prepend --move $HOME/go/bin $HOME/bin

    # TODO: consider using fish_user_path for more permanent paths
    # ensure system paths are there and that they are at the end
    if test -e /etc/paths
        fish_add_path -P -m -a (cat /etc/paths)  # this basically simulates /usr/libexec/path_helper
    else
        fish_add_path -P -m -a /usr/local/bin /usr/bin /bin /usr/sbin /sbin
    end

    # set common variables
    set -gx EDITOR "vim"
    set -gx PAGER "less"
    set -gx GOPATH $HOME/go
    set -gx LANG "en_US.UTF-8"
    # disable homebrew analytics
    set -gx HOMEBREW_NO_ANALYTICS 1
    # disable AWS SAM telemetry
    set -gx SAM_CLI_TELEMETRY 0

    # for installing python via pyenv or asdf, lzma is (optionally) needed
    # so add path to CPPFLAGS
    set -gx CPPFLAGS "-I$HOMEBREW_PREFIX/xz/include"

    # set language variables
    set -gx LANG "en_US.UTF-8"
    set -gx LANGUAGE "en_US.UTF-8"
    set -gx LC_ALL "en_US.UTF-8"

    # initialize prompt
    starship init fish | source
end
