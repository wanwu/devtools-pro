local_front_end=chrome-devtools-frontend
if test -f "$local_front_end"; then
    echo "$local_front_end exists."
    rm -rf $local_front_end
fi

mkdir $local_front_end
cp -R node_modules/chrome-devtools-frontend/front_end/* $local_front_end
