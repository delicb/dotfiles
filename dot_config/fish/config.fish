if status is-interactive
    # set fisher_path $HOME/.config/fish/plugins

    # set fish_complete_path $fish_complete_path[1] $fisher_path/completions $fish_complete_path[2..-1]
    # set fish_function_path $fish_function_path[1] $fisher_path/functions $fish_function_path[2..-1]

    # for file in $fisher_path/conf.d/*.fish
    #     source $file
    # end

    # initialize brew environment variables
    if test -e /opt/homebrew/bin/brew
        /opt/homebrew/bin/brew shellenv | source
    end

    # add some more stuff to path
    fish_add_path -P $HOME/.asdf/bin $HOME/.asdf/shims $HOME/go/bin

    # initialize prompt
    starship init fish | source
end
