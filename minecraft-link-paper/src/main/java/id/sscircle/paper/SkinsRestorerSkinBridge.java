package id.sscircle.paper;

import java.lang.reflect.Method;
import java.util.Optional;
import java.util.UUID;

/**
 * Optional SkinsRestorer 15 API reader. All reflection/storage requests run
 * off-thread. Never force a skin change or use a player name to claim an
 * identity. Only read an existing, explicitly selected skin property.
 */
final class SkinsRestorerSkinBridge {
    record Skin(String url, String model) {}
    private SkinsRestorerSkinBridge() {}

    static Skin readSelectedSkin(ClassLoader loader,UUID playerId,String name) {
        try {
            Class<?> provider=Class.forName("net.skinsrestorer.api.SkinsRestorerProvider",true,loader);
            Object api=provider.getMethod("get").invoke(null);
            Object storage=api.getClass().getMethod("getPlayerStorage").invoke(api);
            // Only saved/selected skin IDs, not arbitrary nickname lookup.
            Object selected=storage.getClass().getMethod("getSkinIdForPlayer",UUID.class,String.class)
                .invoke(storage,playerId,name);
            if(!(selected instanceof Optional<?> opt)||opt.isEmpty())return null;
            Object raw=storage.getClass().getMethod("getSkinForPlayer",UUID.class,String.class,boolean.class)
                .invoke(storage,playerId,name,false);
            if(!(raw instanceof Optional<?> property)||property.isEmpty())return null;
            Object skin=property.get();
            Class<?> utils=Class.forName("net.skinsrestorer.api.PropertyUtils",true,loader);
            Class<?> skinProperty=Class.forName("net.skinsrestorer.api.property.SkinProperty",true,loader);
            Method urlMethod=utils.getMethod("getSkinTextureUrl",skinProperty);
            Method variantMethod=utils.getMethod("getSkinVariant",skinProperty);
            String url=PaperSkinSync.validatedTexture(String.valueOf(urlMethod.invoke(null,skin)));
            if(url==null)return null;
            String model=String.valueOf(variantMethod.invoke(null,skin)).equalsIgnoreCase("SLIM")
                ?"slim":"classic";
            return new Skin(url,model);
        } catch (ReflectiveOperationException | LinkageError | RuntimeException ignored) {
            // Optional plugin/version unavailable. Paper live profile is fallback.
            return null;
        }
    }
}
