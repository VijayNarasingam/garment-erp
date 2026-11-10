package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ProductVariantRepository extends JpaRepository<ProductVariant, Long> {

    List<ProductVariant> findByProductIdOrderBySizeAscColorAsc(Long productId);

    Optional<ProductVariant> findByIdAndBusinessId(Long id, Long businessId);

    Optional<ProductVariant> findByBarcodeAndBusinessId(String barcode, Long businessId);

    boolean existsByBusinessIdAndSkuIgnoreCase(Long businessId, String sku);

    boolean existsByBarcode(String barcode);

    @Query("select v from ProductVariant v join fetch v.product p where v.business.id = :businessId and v.active = true and p.active = true")
    List<ProductVariant> findAllActiveWithProduct(@Param("businessId") Long businessId);

    @Query("""
            select v from ProductVariant v join fetch v.product p left join fetch p.taxCategory
            where v.business.id = :businessId and v.updatedAt > :since
            order by v.id
            """)
    List<ProductVariant> findForSync(@Param("businessId") Long businessId, @Param("since") java.time.Instant since);

    @Query("""
            select v from ProductVariant v join fetch v.product p
            where v.business.id = :businessId and v.active = true and p.active = true
              and (v.barcode = :term or v.sku = :term or p.code = :term)
            """)
    List<ProductVariant> findByExactCode(@Param("businessId") Long businessId, @Param("term") String term);

    @Query("""
            select v from ProductVariant v join fetch v.product p
            where v.business.id = :businessId and v.active = true and p.active = true
              and (lower(p.name) like lower(concat('%', :q, '%'))
                   or lower(v.sku) like lower(concat('%', :q, '%'))
                   or v.barcode like concat('%', :q, '%')
                   or lower(v.color) like lower(concat('%', :q, '%')))
            order by p.name, v.size
            """)
    List<ProductVariant> search(@Param("businessId") Long businessId, @Param("q") String q);
}
